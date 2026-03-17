// Pre-tournament championship odds (implied probability from American odds)
// Source: SI Sportsbook, March 2026
// These are static and won't change once the tournament starts

const CHAMPIONSHIP_ODDS: Record<string, number> = {
  // 1 seeds
  "Duke": 23.3,
  "Arizona": 20.0,
  "Florida": 12.5,
  "Michigan": 22.2,

  // 2 seeds
  "UConn": 5.6,
  "Purdue": 2.8,
  "Houston": 9.1,
  "Iowa St.": 4.3,

  // 3 seeds
  "Michigan St.": 2.4,
  "Gonzaga": 1.8,
  "Illinois": 5.0,
  "Virginia": 1.6,

  // 4 seeds
  "Kansas": 2.0,
  "Arkansas": 2.0,
  "Nebraska": 1.0,
  "Alabama": 1.0,

  // 5 seeds
  "St. John's": 2.0,
  "Wisconsin": 1.4,
  "Vanderbilt": 1.5,
  "Texas Tech": 0.9,

  // 6 seeds
  "Louisville": 0.8,
  "BYU": 0.8,
  "North Carolina": 0.9,
  "Tennessee": 1.1,

  // 7 seeds
  "UCLA": 0.8,
  "Miami FL": 0.4,
  "Saint Mary's": 0.4,
  "Kentucky": 1.0,

  // 8 seeds
  "Ohio St.": 0.4,
  "Villanova": 0.4,
  "Clemson": 0.5,
  "Georgia": 0.3,

  // 9 seeds
  "TCU": 0.3,
  "Utah St.": 0.4,
  "Iowa": 0.5,
  "Saint Louis": 0.2,

  // 10 seeds
  "UCF": 0.3,
  "Missouri": 0.4,
  "Texas A&M": 0.5,
  "Santa Clara": 0.2,

  // 11 seeds
  "South Florida": 0.2,
  "NC State": 0.5,
  "Texas": 0.2,
  "VCU": 0.2,
  "SMU": 0.3,
  "Miami Ohio": 0.1,

  // 12 seeds
  "Northern Iowa": 0.1,
  "High Point": 0.1,
  "McNeese": 0.1,
  "Akron": 0.2,

  // 13 seeds
  "Cal Baptist": 0.1,
  "Hawaii": 0.1,
  "Troy": 0.1,
  "Hofstra": 0.1,

  // 14 seeds
  "North Dakota St.": 0.1,
  "Kennesaw St.": 0.1,
  "Penn": 0.1,
  "Wright St.": 0.1,

  // 15 seeds
  "Furman": 0.1,
  "Queens NC": 0.1,
  "Idaho": 0.1,
  "Tennessee St.": 0.1,

  // 16 seeds
  "Siena": 0.1,
  "Long Island": 0.1,
  "Lehigh": 0.1,
  "Prairie View A&M": 0.1,
  "Howard": 0.1,
  "UMBC": 0.1,
};

export function getWinProbability(teamName: string): number {
  return CHAMPIONSHIP_ODDS[teamName] ?? 0.1;
}

export function formatOdds(probability: number): string {
  if (probability >= 10) return `${probability.toFixed(0)}%`;
  if (probability >= 1) return `${probability.toFixed(1)}%`;
  return `${probability.toFixed(1)}%`;
}
