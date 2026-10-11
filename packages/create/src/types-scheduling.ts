/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Scheduling / 4D parameter shapes for `IfcCreator` — IfcWorkSchedule,
 * IfcWorkPlan, IfcTask, IfcRelSequence, and IfcWorkCalendar with the
 * IfcWorkTime / IfcRecurrencePattern / IfcTimePeriod entities it owns.
 *
 * A sibling of `types.ts` rather than a section inside it, so that file
 * stays under its recorded module-size budget (see
 * `scripts/module-size-allowlist.txt`). `types.ts` re-exports everything
 * here, so no consumer's import path changes.
 */

export type WorkScheduleType =
  | 'ACTUAL' | 'BASELINE' | 'PLANNED'
  | 'USERDEFINED' | 'NOTDEFINED';

/**
 * IFC task-type enum — union of IFC4 and IFC4X3 `IfcTaskTypeEnum` values.
 *
 * IFC4 introduced the first 14. IFC4X3 added 9 more to cover the
 * operations/maintenance lifecycle (ADJUSTMENT through TROUBLESHOOTING).
 * The superset is exposed here so scripts can author schedules for
 * either schema; IFC4 files that try to round-trip the newer values
 * may fail validation on strict toolchains — caller's responsibility.
 */
export type TaskPredefinedType =
  // IFC4 values
  | 'ATTENDANCE' | 'CONSTRUCTION' | 'DEMOLITION' | 'DISMANTLE'
  | 'DISPOSAL' | 'INSTALLATION' | 'LOGISTIC' | 'MAINTENANCE'
  | 'MOVE' | 'OPERATION' | 'REMOVAL' | 'RENOVATION'
  | 'USERDEFINED' | 'NOTDEFINED'
  // IFC4X3 additions (operations / maintenance lifecycle)
  | 'ADJUSTMENT' | 'CALIBRATION' | 'EMERGENCY' | 'INSPECTION'
  | 'SAFETY' | 'SHUTDOWN' | 'STARTUP' | 'TESTING' | 'TROUBLESHOOTING';

export type TaskDurationType =
  | 'WORKTIME' | 'ELAPSEDTIME' | 'NOTDEFINED';

export type SequenceType =
  | 'START_START' | 'START_FINISH' | 'FINISH_START' | 'FINISH_FINISH'
  | 'USERDEFINED' | 'NOTDEFINED';

/**
 * IfcWorkSchedule parameters.
 *
 * Timestamps are ISO 8601 datetimes (e.g. "2024-05-01T08:00:00").
 * `Duration` / `TotalFloat` use ISO 8601 durations (e.g. "P30D", "PT8H").
 */
export interface WorkScheduleParams {
  Name: string;
  Description?: string;
  Identification?: string;
  CreationDate?: string;
  StartTime: string;
  FinishTime?: string;
  Purpose?: string;
  Duration?: string;
  TotalFloat?: string;
  PredefinedType?: WorkScheduleType;
}

/** IfcWorkPlan parameters — identical shape to IfcWorkSchedule. */
export interface WorkPlanParams extends WorkScheduleParams {}

/** Canonical IFC-prefixed alias for {@link WorkScheduleParams}. */
export type IfcWorkScheduleParams = WorkScheduleParams;
/** Canonical IFC-prefixed alias for {@link WorkPlanParams}. */
export type IfcWorkPlanParams = WorkPlanParams;
/** Canonical IFC-prefixed alias for {@link WorkScheduleType}. */
export type IfcWorkScheduleType = WorkScheduleType;
/** Canonical IFC-prefixed alias for {@link TaskPredefinedType}. */
export type IfcTaskPredefinedType = TaskPredefinedType;
/** Canonical IFC-prefixed alias for {@link TaskDurationType}. */
export type IfcTaskDurationType = TaskDurationType;

/**
 * IfcTask parameters.
 *
 * When any of the *Start / *Finish / *Duration / IsCritical / Completion
 * fields is supplied, an IfcTaskTime is created and linked.
 */
export interface TaskParams {
  Name: string;
  Description?: string;
  ObjectType?: string;
  Identification?: string;
  LongDescription?: string;
  Status?: string;
  WorkMethod?: string;
  IsMilestone?: boolean;
  Priority?: number;
  PredefinedType?: TaskPredefinedType;
  /** ISO 8601 datetime */
  ScheduleStart?: string;
  ScheduleFinish?: string;
  ScheduleDuration?: string;
  ActualStart?: string;
  ActualFinish?: string;
  ActualDuration?: string;
  EarlyStart?: string;
  EarlyFinish?: string;
  LateStart?: string;
  LateFinish?: string;
  FreeFloat?: string;
  TotalFloat?: string;
  RemainingTime?: string;
  StatusTime?: string;
  IsCritical?: boolean;
  DurationType?: TaskDurationType;
  /** Percent complete 0..100 */
  Completion?: number;
}

/** Canonical IFC-prefixed alias for {@link TaskParams}. */
export type IfcTaskParams = TaskParams;

export type WorkCalendarType =
  | 'FIRSTSHIFT' | 'SECONDSHIFT' | 'THIRDSHIFT'
  | 'USERDEFINED' | 'NOTDEFINED';

export type RecurrenceType =
  | 'DAILY' | 'WEEKLY'
  | 'MONTHLY_BY_DAY_OF_MONTH' | 'MONTHLY_BY_POSITION'
  | 'BY_DAY_COUNT' | 'BY_WEEKDAY_COUNT'
  | 'YEARLY_BY_DAY_OF_MONTH' | 'YEARLY_BY_POSITION';

/** One StartTime/EndTime pair on an IfcRecurrencePattern (IfcTimePeriod). */
export interface TimePeriodParams {
  /** IfcTime, e.g. "07:00:00". */
  StartTime: string;
  EndTime: string;
}

/** IfcRecurrencePattern — the repeat rule an IfcWorkTime may carry. */
export interface RecurrencePatternParams {
  RecurrenceType: RecurrenceType;
  /** Days of the month, 1..31. */
  DayComponent?: number[];
  /** Days of the week, 1 (Monday) .. 7 (Sunday). */
  WeekdayComponent?: number[];
  /** Months of the year, 1..12. */
  MonthComponent?: number[];
  Position?: number;
  Interval?: number;
  Occurrences?: number;
  TimePeriods?: TimePeriodParams[];
}

/**
 * IfcWorkTime — one working (or exception) period on an IfcWorkCalendar.
 * `Start`/`Finish` are IfcDate strings (date only, e.g. "2024-05-01"), NOT
 * the datetimes IfcWorkSchedule uses.
 */
export interface WorkTimeParams {
  Name?: string;
  DataOrigin?: string;
  UserDefinedDataOrigin?: string;
  RecurrencePattern?: RecurrencePatternParams;
  Start?: string;
  Finish?: string;
}

/**
 * IfcWorkCalendar parameters. Assign the calendar to tasks or schedules
 * with `addIfcRelAssignsToControl(calendarId, ids)` (or the
 * `assignCalendarToTasks` alias) — IfcWorkCalendar is an IfcControl, so
 * that generic relation already accepts it.
 */
export interface WorkCalendarParams {
  Name: string;
  Description?: string;
  ObjectType?: string;
  Identification?: string;
  PredefinedType?: WorkCalendarType;
  WorkingTimes?: WorkTimeParams[];
  ExceptionTimes?: WorkTimeParams[];
}

/** Canonical IFC-prefixed alias for {@link WorkCalendarParams}. */
export type IfcWorkCalendarParams = WorkCalendarParams;
/** Canonical IFC-prefixed alias for {@link WorkTimeParams}. */
export type IfcWorkTimeParams = WorkTimeParams;
/** Canonical IFC-prefixed alias for {@link RecurrencePatternParams}. */
export type IfcRecurrencePatternParams = RecurrencePatternParams;
/** Canonical IFC-prefixed alias for {@link TimePeriodParams}. */
export type IfcTimePeriodParams = TimePeriodParams;
/** Canonical IFC-prefixed alias for {@link WorkCalendarType}. */
export type IfcWorkCalendarType = WorkCalendarType;
/** Canonical IFC-prefixed alias for {@link RecurrenceType}. */
export type IfcRecurrenceType = RecurrenceType;

/** IfcRelSequence parameters (predecessor → successor edge). */
export interface IfcRelSequenceParams {
  SequenceType?: IfcRelSequenceType;
  /** ISO 8601 duration (e.g. "P2D"). Negative durations indicate leads. */
  TimeLag?: string;
  /** Duration type applied to the lag (default WORKTIME). */
  LagDurationType?: TaskDurationType;
  UserDefinedSequenceType?: string;
}

/** @deprecated Use {@link IfcRelSequenceParams}. */
export type SequenceParams = IfcRelSequenceParams;

/** Canonical alias using the IFC EXPRESS enum name. */
export type IfcRelSequenceType = SequenceType;
