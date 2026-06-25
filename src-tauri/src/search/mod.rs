//! Fuzzy subsequence matching for asset search.

#[cfg(test)]
mod golden_tests;

pub fn fuzzy_score(query: &str, text: &str) -> Option<u32> {
    let q = query.trim().to_ascii_lowercase();
    if q.is_empty() {
        return None;
    }
    let t = text.to_ascii_lowercase();
    if t.contains(&q) {
        return Some(1000 - q.len() as u32);
    }

    let mut qi = 0;
    let qb: Vec<char> = q.chars().collect();
    let tc: Vec<char> = t.chars().collect();
    let mut score = 0i32;
    let mut last_match = None;

    for (ti, ch) in tc.iter().enumerate() {
        if qi < qb.len() && *ch == qb[qi] {
            score += 10;
            if let Some(prev) = last_match {
                let gap = ti.saturating_sub(prev);
                if gap > 1 {
                    score -= (gap as i32 - 1) * 2;
                }
            }
            last_match = Some(ti);
            qi += 1;
        }
    }

    if qi == qb.len() {
        Some(score.max(1) as u32)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_subsequence() {
        assert!(fuzzy_score("stn", "stone").is_some());
        assert!(fuzzy_score("xyz", "stone").is_none());
    }

    #[test]
    fn empty_query_does_not_match_everything() {
        assert!(fuzzy_score("", "stone").is_none());
        assert!(fuzzy_score("   ", "stone").is_none());
    }

    // Detailed vectors live in golden_tests.rs + tests/fixtures/fuzzy_golden.json
}
