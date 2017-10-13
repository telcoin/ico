const seconds = val => val
const minutes = val => val * seconds(60)
const hours = val => val * minutes(60)
const days = val => val * hours(24)
const weeks = val => val * days(7)
const years = val => val * days(365)

module.exports = {
  seconds,
  minutes,
  hours,
  days,
  weeks,
  years
}
