//! EXP-007: parity tests against tests/fixtures/fuzzy_golden.json (shared with vitest).

use serde::Deserialize;

use super::fuzzy_score;

#[derive(Debug, Deserialize)]
struct GoldenFile {
    cases: Vec<GoldenCase>,
}

#[derive(Debug, Deserialize)]
struct GoldenCase {
    query: String,
    text: String,
    #[serde(rename = "match")]
    matches: bool,
    score: Option<u32>,
}

#[test]
fn fuzzy_score_matches_shared_golden_vectors() {
    let raw = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../tests/fixtures/fuzzy_golden.json"
    ));
    let golden: GoldenFile =
        serde_json::from_str(raw).expect("parse fuzzy_golden.json");

    for case in golden.cases {
        let actual = fuzzy_score(&case.query, &case.text);
        if case.matches {
            let expected = case.score.expect("golden case missing score");
            assert_eq!(
                actual,
                Some(expected),
                "query={:?} text={:?}",
                case.query,
                case.text
            );
        } else {
            assert_eq!(
                actual, None,
                "query={:?} text={:?}",
                case.query, case.text
            );
        }
    }
}
