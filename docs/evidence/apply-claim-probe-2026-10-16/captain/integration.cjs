// Captain-owned caller, shared by both comparison arms.
function previewBooking(api, rows, now, advanceHours) {
  const parts = api.getShanghaiParts(new Date(now).toISOString())
  const days = api.filterPickupSliceTimes(rows, now, advanceHours)
  return {
    beijingNow: `${parts.nian}-${parts.yue}-${parts.ri} ${parts.shi}:${parts.fen}:${parts.miao}`,
    days,
    selectableSlots: days.reduce((count, day) => count + day.timesRanges.length, 0)
  }
}

module.exports = { previewBooking }
