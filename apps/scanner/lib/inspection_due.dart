import 'package:intl/intl.dart';

/// How a unit's next DGUV inspection stands. The server derives the date (see
/// the `inspection` tag in openapi.yaml); the app only reads it.
enum InspectionUrgency { overdue, dueToday, soon, later }

/// The calendar day a date from the API names.
///
/// An inspection's day travels as midnight UTC, and reading that in local time
/// would move it to the previous evening west of Greenwich — so a value at
/// exactly midnight UTC is taken as the UTC day. Anything else (a unit never
/// inspected is due from the moment it was registered) is a real instant and
/// is read in local time.
DateTime inspectionDay(DateTime value) {
  final utc = value.toUtc();
  if (utc.hour == 0 && utc.minute == 0 && utc.second == 0 && utc.millisecond == 0) {
    return DateTime(utc.year, utc.month, utc.day);
  }
  final local = value.toLocal();
  return DateTime(local.year, local.month, local.day);
}

/// "17.10.2026" or "10/17/2026", by the app's language.
String formatInspectionDay(DateTime value, String locale) =>
    DateFormat.yMd(locale).format(inspectionDay(value));

/// [soon] is the month ahead, so a unit that runs out before the next job is
/// visible before it does.
InspectionUrgency inspectionUrgency(DateTime due, {DateTime? now}) {
  final clock = now ?? DateTime.now();
  final today = DateTime(clock.year, clock.month, clock.day);
  final day = inspectionDay(due);
  if (day.isBefore(today)) return InspectionUrgency.overdue;
  if (day == today) return InspectionUrgency.dueToday;
  if (day.isBefore(today.add(const Duration(days: 31)))) return InspectionUrgency.soon;
  return InspectionUrgency.later;
}

/// `YYYY-MM-DD` of a local calendar day, as InspectionRequest.performedAt wants.
String inspectionRequestDate(DateTime day) =>
    '${day.year.toString().padLeft(4, '0')}-'
    '${day.month.toString().padLeft(2, '0')}-'
    '${day.day.toString().padLeft(2, '0')}';
