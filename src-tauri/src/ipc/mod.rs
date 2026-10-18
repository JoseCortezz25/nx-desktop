//! Cross-language IPC contract primitives.
//!
//! Slice 1 of issue #16 owns the shared kernel only: the closed public error
//! contract ([`error::AppErrorDto`] / [`error::AppErrorCode`]). Feature DTOs,
//! commands, their registration and their streaming frames belong to later
//! slices and must not be added here.

pub mod error;
