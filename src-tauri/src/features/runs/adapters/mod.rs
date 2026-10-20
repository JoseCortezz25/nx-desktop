//! Run adapter implementations (issue #19).
//!
//! Only the fake engine ships here; the real process adapters belong to
//! #25–#27 and implement the same [`super::ports::AgentRunner`] seam.

pub mod fake;
