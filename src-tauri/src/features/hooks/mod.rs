//! Hook review and approval policy foundation (issue #20).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this slice adds
//! the hook domain, the approval matrix, the source/executor ports and their
//! adapters. The review service and commands land in the next slice.

pub mod adapters;
pub mod approval_policy;
pub mod domain;
pub mod dto;
pub mod ports;
