// 预约需提前的【小时数】，修改此处即可调整所有时段过滤规则。
const PICKUP_ADVANCE_HOURS = 2

export function isPickupTimeAvailable(dateKey, startTime, now = Date.now()) {
  // 日期和时间均按用户本地时区解析；整段必须满足预约提前量。
  const start = new Date(`${dateKey}T${startTime}`).getTime()
  return (
    Number.isFinite(start) &&
    start >= now + PICKUP_ADVANCE_HOURS * 60 * 60 * 1000
  )
}

export function filterPickupSliceTimes(dateList, now = Date.now(), excludedDateKeys = []) {
  if (!Array.isArray(excludedDateKeys)) {
    throw new TypeError('excludedDateKeys must be an array')
  }

  return dateList
    .filter((item) => !(typeof item.dateKey === 'string' && excludedDateKeys.includes(item.dateKey)))
    .map((item) => ({
      ...item,
      timesRanges: (item.timesRanges || []).filter((range) =>
        isPickupTimeAvailable(item.dateKey, range.startTime, now)
      )
    }))
    .filter((item) => item.timesRanges.length)
}
