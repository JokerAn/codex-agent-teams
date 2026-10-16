// Test-only adapter. The supplied filter is owned by the member.
export function summarizePickupOptions(filter, dateList, now, excludedDateKeys = []) {
  const available = filter(dateList, now, excludedDateKeys);
  const firstDay = available[0];
  return {
    availableDates: available.length,
    availableRanges: available.reduce((total, day) => total + day.timesRanges.length, 0),
    firstAvailable: firstDay
      ? { dateKey: firstDay.dateKey, startTime: firstDay.timesRanges[0].startTime }
      : null,
  };
}
