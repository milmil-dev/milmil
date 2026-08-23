//go:build race

package anidb

// raceEnabled reports whether the test binary was built with -race. Race
// instrumentation slows execution by roughly 10x, which makes wall-clock
// assertions meaningless, so timing checks are skipped when it is on.
const raceEnabled = true
