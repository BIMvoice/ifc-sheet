// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! nom-combinator tokenizer for STEP/IFC entity lines.
//!
//! Zero-copy tokenization: string-like tokens borrow their original bytes.

use nom::{
    branch::alt,
    bytes::complete::take_while1,
    character::complete::{char, digit1, one_of},
    combinator::{map, map_res, opt, recognize},
    multi::separated_list0,
    sequence::{delimited, pair, preceded},
    IResult, Parser,
};

use crate::error::{Error, Result};
use crate::generated::IfcType;

/// STEP/IFC token.
///
/// String-like tokens borrow their original bytes. Decode them only at a
/// user-facing boundary so malformed real-world encodings cannot invalidate
/// the structural parser.
#[derive(Debug, Clone, PartialEq)]
pub enum Token<'a> {
    /// Entity reference: #123
    EntityRef(u32),
    /// String literal: 'text'
    String(&'a [u8]),
    /// Integer: 42
    Integer(i64),
    /// Float: 3.14
    Float(f64),
    /// Enum: .TRUE., .FALSE., .UNKNOWN.
    Enum(&'a [u8]),
    /// List: (1, 2, 3)
    List(Vec<Token<'a>>),
    /// Typed value: IFCPARAMETERVALUE(0.), IFCBOOLEAN(.T.)
    TypedValue(&'a [u8], Vec<Token<'a>>),
    /// Null value: $
    Null,
    /// Asterisk (derived value): *
    Derived,
}

/// Parse entity reference: #123
fn entity_ref(input: &[u8]) -> IResult<&[u8], Token<'_>> {
    map(
        preceded(char('#'), map_res(digit1, lexical_core::parse::<u32>)),
        Token::EntityRef,
    )
    .parse(input)
}

/// Parse string literal: 'text' or "text"
/// IFC uses '' to escape a single quote within a string
/// Uses memchr for SIMD-accelerated quote searching
fn string_literal(input: &[u8]) -> IResult<&[u8], Token<'_>> {
    // Helper to parse string content with escaped quotes - SIMD optimized
    #[inline]
    fn parse_string_content(input: &[u8], quote_byte: u8) -> IResult<&[u8], &[u8]> {
        let bytes = input;
        let mut pos = 0;

        // Use memchr for SIMD-accelerated searching
        while let Some(found) = memchr::memchr(quote_byte, &bytes[pos..]) {
            let idx = pos + found;
            // Check if it's an escaped quote (doubled)
            if idx + 1 < bytes.len() && bytes[idx + 1] == quote_byte {
                pos = idx + 2; // Skip escaped quote pair
                continue;
            }
            // End of string found
            return Ok((&input[idx..], &input[..idx]));
        }

        // No closing quote found
        Err(nom::Err::Error(nom::error::Error::new(
            input,
            nom::error::ErrorKind::Char,
        )))
    }

    alt((
        map(
            delimited(char('\''), |i| parse_string_content(i, b'\''), char('\'')),
            Token::String,
        ),
        map(
            delimited(char('"'), |i| parse_string_content(i, b'"'), char('"')),
            Token::String,
        ),
    ))
    .parse(input)
}

/// Parse integer: 42, -42, +42
///
/// ISO 10303-21 spells `INTEGER` as `[ SIGN ] DIGIT { DIGIT }` with
/// `SIGN = '+' | '-'`, so a leading `+` is as legal as a leading `-`. Accepting
/// only `-` dropped the WHOLE entity, not just the attribute: every caller of
/// `parse_entity` discards a record that fails to tokenize
/// (`let Ok(..) = .. else { continue }`). The exponent sign below already
/// accepted both, `fast_float2::parse_partial` (the fast reader in `decoder.rs`)
/// accepts `+`, and the TypeScript half reads values with `parseFloat`, so the
/// same file used to decode differently in the browser and in wasm.
/// Uses lexical-core for 10x faster parsing
#[inline]
fn integer(input: &[u8]) -> IResult<&[u8], Token<'_>> {
    map_res(recognize((opt(one_of("+-")), digit1)), |s: &[u8]| {
        lexical_core::parse::<i64>(s)
            .map(Token::Integer)
            .map_err(|_| "parse error")
    })
    .parse(input)
}

/// Parse float: 3.14, -3.14, +3.14, 1.5E-10, 0., 1.
/// IFC allows floats like "0." without decimal digits
///
/// `REAL` carries the same `[ SIGN ]` as `INTEGER`; see [`integer`] for why a
/// rejected sign costs the whole entity.
/// Uses lexical-core for 10x faster parsing
#[inline]
fn float(input: &[u8]) -> IResult<&[u8], Token<'_>> {
    map_res(
        recognize((
            opt(one_of("+-")),
            digit1,
            char('.'),
            opt(digit1), // Made optional to support "0." format
            opt((one_of("eE"), opt(one_of("+-")), digit1)),
        )),
        |s: &[u8]| {
            lexical_core::parse::<f64>(s)
                .map(Token::Float)
                .map_err(|_| "parse error")
        },
    )
    .parse(input)
}

/// Parse enum: .TRUE., .FALSE., .UNKNOWN., .ELEMENT.
fn enum_value(input: &[u8]) -> IResult<&[u8], Token<'_>> {
    map(
        delimited(
            char('.'),
            take_while1(|c: u8| c.is_ascii_alphanumeric() || c == b'_'),
            char('.'),
        ),
        Token::Enum,
    )
    .parse(input)
}

/// Parse null: $
fn null(input: &[u8]) -> IResult<&[u8], Token<'_>> {
    map(char('$'), |_| Token::Null).parse(input)
}

/// Parse derived: *
fn derived(input: &[u8]) -> IResult<&[u8], Token<'_>> {
    map(char('*'), |_| Token::Derived).parse(input)
}

/// Maximum nesting depth for token recursion (list and typed-value bodies).
///
/// Each `(` in the input bumps depth by one. Real-world IFC entities rarely
/// nest beyond 5-10 levels; 256 leaves comfortable headroom while keeping
/// the stack bounded against pathological inputs.
const MAX_NESTING_DEPTH: u32 = 256;

/// Comma-separated tokens at `depth`: `separated_list0(delimited(ws, char(','), ws),
/// token_at_depth)`, written out as a loop with nom's exact semantics (stop
/// with the items so far on an `Err::Error` from the separator or an element,
/// propagate `Failure`, and return `SeparatedList` if a round consumes
/// nothing).
///
/// Written by hand because it sits on the recursive path: with nom 8's
/// by-value `Parser` structs, the combinator version made every nesting level's
/// unoptimized frame large enough that `MAX_NESTING_DEPTH` levels overflowed a
/// 2 MiB test-thread stack, where nom 7 fit.
fn token_list_at_depth(input: &[u8], depth: u32) -> IResult<&[u8], Vec<Token<'_>>> {
    let mut items = Vec::new();
    let mut rest = input;
    match token_at_depth(rest, depth) {
        Err(nom::Err::Error(_)) => return Ok((rest, items)),
        Err(e) => return Err(e),
        Ok((next, item)) => {
            items.push(item);
            rest = next;
        }
    }
    loop {
        let len = rest.len();
        let after_sep = match delimited(ws, char(','), ws).parse(rest) {
            Err(nom::Err::Error(_)) => return Ok((rest, items)),
            Err(e) => return Err(e),
            Ok((next, _)) => next,
        };
        match token_at_depth(after_sep, depth) {
            Err(nom::Err::Error(_)) => return Ok((rest, items)),
            Err(e) => return Err(e),
            Ok((next, item)) => {
                if next.len() == len {
                    return Err(nom::Err::Error(nom::error::Error::new(
                        rest,
                        nom::error::ErrorKind::SeparatedList,
                    )));
                }
                items.push(item);
                rest = next;
            }
        }
    }
}

/// Parse typed value: IFCPARAMETERVALUE(0.), IFCBOOLEAN(.T.)
///
/// The type name and its `(` are usually adjacent, but a STEP writer's line
/// wrap can land exactly between them - measured on a real file where 39 of
/// 175 `IFCSURFACESTYLERENDERING` entities wrap as `…MEASURE\r\n(1.)`. Without
/// `ws` here, `char('(')` sees `\r` and the whole entity fails to parse, which
/// silently dropped it from every full-file walk (`decode_at_uncached` returns
/// `Err`, and every caller's `let Ok(..) = .. else { continue }` skips it) -
/// the entity was never malformed, just wrapped where the parser assumed it
/// never would be.
///
/// An EMPTY argument list also needs `ws` on both sides of the parens
/// (`IFCLABEL(\r\n)`), not just before `(`: `separated_list0` matches zero
/// items without consuming anything, so with a bare `char(')')` any
/// whitespace or comment before the `)` left it unconsumed and the whole
/// typed value failed to parse (#3789).
fn typed_value_at_depth(input: &[u8], depth: u32) -> IResult<&[u8], Token<'_>> {
    // Hand-written sequence (recursive path; see `token_at_depth`).
    // Type name (all caps with optional numbers/underscores)
    let (i, type_name) =
        take_while1(|c: u8| c.is_ascii_alphanumeric() || c == b'_').parse(input)?;
    // Arguments
    let (i, _) = ws(i)?;
    let (i, _) = literal(b'(', i)?;
    let (i, _) = ws(i)?;
    let (i, args) = token_list_at_depth(i, depth)?;
    let (i, _) = ws(i)?;
    let (i, _) = literal(b')', i)?;
    Ok((i, Token::TypedValue(type_name, args)))
}

/// One literal byte, `char(c)` for the byte-slice input of this tokenizer.
fn literal(c: u8, input: &[u8]) -> IResult<&[u8], char> {
    char(c as char).parse(input)
}

/// Skip whitespace AND `/* ... */` comments -- 10303-21 allows a comment
/// anywhere whitespace is allowed, including between the attributes this
/// tokenizer decodes. Without this, `/* rev; b */ $` was not trivia: no `alt`
/// branch in `token_at_depth` starts with `/`, so a comment before a value
/// made the whole entity fail to parse rather than reading the value clean.
///
/// Reuses `skip_step_trivia`, the matched pair of the scanners' trivia skip
/// (`step-lexing.ts`'s `skipTrivia` on the TS side). An unterminated comment
/// consumes to end of input rather than failing this always-succeeds
/// combinator; the `alt` that follows then has nothing left to match and the
/// entity fails to parse, which is the existing behaviour for corrupt input.
fn ws(input: &[u8]) -> IResult<&[u8], ()> {
    let end = super::lexical::skip_step_trivia(input, 0).unwrap_or(input.len());
    Ok((&input[end..], ()))
}

/// Parse a token with optional surrounding whitespace
/// Optimized ordering: test cheapest patterns first (single-char markers)
fn token(input: &[u8]) -> IResult<&[u8], Token<'_>> {
    token_at_depth(input, 0)
}

fn token_at_depth(input: &[u8], depth: u32) -> IResult<&[u8], Token<'_>> {
    if depth > MAX_NESTING_DEPTH {
        return Err(nom::Err::Failure(nom::error::Error::new(
            input,
            nom::error::ErrorKind::TooLarge,
        )));
    }
    // `delimited(ws, alt((...)), ws)`, written out as sequential tries with
    // nom's `alt` semantics: the next alternative runs only after an
    // `Err::Error`, `Failure` is returned at once, and the error of the LAST
    // alternative is the one reported. This function is on the recursive
    // path; the combinator form (nom 8's by-value `Parser` structs) made each
    // nesting level's unoptimized frame large enough that `MAX_NESTING_DEPTH`
    // levels overflowed a 2 MiB test-thread stack, where nom 7 fit.
    let (i, _) = ws(input)?;
    macro_rules! or_else {
        ($r:expr, $next:expr) => {
            match $r {
                Err(nom::Err::Error(_)) => $next,
                other => other,
            }
        };
    }
    let parsed = or_else!(
        // Single-char markers first (O(1) check)
        null(i), // $
        or_else!(
            derived(i), // *
            or_else!(
                entity_ref(i), // # + digits
                or_else!(
                    // Then by complexity
                    enum_value(i), // .XXX.
                    or_else!(
                        string_literal(i), // 'xxx'
                        or_else!(
                            list_at_depth(i, depth + 1), // (...)
                            // Numbers: float before integer since float includes '.'
                            or_else!(
                                float(i),
                                or_else!(
                                    integer(i),
                                    // IFCPARAMETERVALUE(0.) - most expensive, last
                                    typed_value_at_depth(i, depth + 1)
                                )
                            )
                        )
                    )
                )
            )
        )
    );
    let (rest, token) = parsed?;
    let (rest, _) = ws(rest)?;
    Ok((rest, token))
}

/// Parse list: (1, 2, 3) or nested lists
/// Test-only wrapper for the depth-0 entry into list.
#[cfg(test)]
fn list(input: &[u8]) -> IResult<&[u8], Token<'_>> {
    list_at_depth(input, 0)
}

/// An EMPTY list (`( )`, `(\r\n)`, `(/* empty */)`) needs `ws` explicitly
/// around the empty `separated_list0`: it matches zero items without
/// consuming anything, so a bare `char(')')` failed to parse past any
/// whitespace or comment left between the parens (#3789, same shape as
/// `typed_value_at_depth`'s empty-args fix).
fn list_at_depth(input: &[u8], depth: u32) -> IResult<&[u8], Token<'_>> {
    // Hand-written sequence (recursive path; see `token_at_depth`).
    let (i, _) = literal(b'(', input)?;
    let (i, _) = ws(i)?;
    let (i, items) = token_list_at_depth(i, depth)?;
    let (i, _) = ws(i)?;
    let (i, _) = literal(b')', i)?;
    Ok((i, Token::List(items)))
}

/// Parse a complete entity line from raw IFC bytes.
/// Example: #123=IFCWALL('guid','owner',$,$,'name',$,$,$);
// The nom `IResult` parser tuple type is intentionally explicit here; factoring
// it into a `type` alias would obscure the parser combinator structure.
#[allow(clippy::type_complexity)]
pub fn parse_entity<'a, T>(input: &'a T) -> Result<(u32, IfcType, Vec<Token<'a>>)>
where
    T: AsRef<[u8]> + ?Sized,
{
    let input = input.as_ref();
    let result: IResult<&[u8], (u32, &[u8], Vec<Token>)> = (
        // Entity ID: #123
        delimited(
            ws,
            preceded(char('#'), map_res(digit1, lexical_core::parse::<u32>)),
            ws,
        ),
        // Equals sign
        preceded(
            char('='),
            // Entity type: IFCWALL
            delimited(
                ws,
                take_while1(|c: u8| c.is_ascii_alphanumeric() || c == b'_'),
                ws,
            ),
        ),
        // Arguments: ('guid', 'owner', ...). `ws` around the empty
        // `separated_list0` handles an EMPTY argument list separated from
        // its `)` by whitespace or a comment (`#1=IFCX(\r\n);`), the same
        // shape as `list_at_depth`'s and `typed_value_at_depth`'s fix
        // (#3789): with zero items `separated_list0` consumes nothing, so
        // a bare `char(')')` failed to parse past it.
        delimited(
            pair(char('('), ws),
            separated_list0(delimited(ws, char(','), ws), token),
            (ws, char(')'), ws, char(';')),
        ),
    )
        .parse(input);

    match result {
        Ok((_, (id, type_str, args))) => {
            let type_str = std::str::from_utf8(type_str)
                .map_err(|_| Error::parse(0, "Entity type is not ASCII/UTF-8"))?;
            let ifc_type = IfcType::from_str(type_str);
            Ok((id, ifc_type, args))
        }
        Err(e) => Err(Error::parse(0, format!("Failed to parse entity: {}", e))),
    }
}

#[cfg(test)]
#[path = "tokenizer_tests.rs"]
mod tokenizer_tests;
