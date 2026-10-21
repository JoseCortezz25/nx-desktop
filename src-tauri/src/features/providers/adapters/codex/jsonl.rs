//! Chunk-boundary-safe JSON Lines framer (issue #26).
//!
//! The child's stdout arrives in arbitrary chunks; this splits it into
//! complete `\n`-terminated lines, tolerating `\r\n`, without ever splitting
//! a multi-byte character (lines are validated as UTF-8 only once complete).
//! A line longer than [`MAX_LINE_BYTES`] is rejected so a runaway vendor
//! process cannot grow the buffer without bound.

/// Largest accepted event line. Command items carry their aggregated output,
/// so this is larger than the SSE event limit of the Claude adapter.
pub const MAX_LINE_BYTES: usize = 8 * 1024 * 1024;

/// Why a chunk could not be framed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FramingError {
    LineTooLong,
    InvalidUtf8,
}

/// Accumulates bytes and yields complete, non-blank lines.
#[derive(Debug, Default)]
pub struct JsonlFramer {
    pending: Vec<u8>,
    limit: usize,
}

impl JsonlFramer {
    pub fn new() -> Self {
        Self::with_limit(MAX_LINE_BYTES)
    }

    pub fn with_limit(limit: usize) -> Self {
        Self {
            pending: Vec::new(),
            limit,
        }
    }

    /// Feeds one chunk and returns every line it completed.
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<String>, FramingError> {
        let mut lines = Vec::new();
        let mut rest = chunk;
        while let Some(newline) = rest.iter().position(|byte| *byte == b'\n') {
            let (head, tail) = rest.split_at(newline);
            self.extend(head)?;
            rest = &tail[1..];
            let line = std::mem::take(&mut self.pending);
            if let Some(text) = finish_line(line)? {
                lines.push(text);
            }
        }
        self.extend(rest)?;
        Ok(lines)
    }

    /// Returns a final unterminated line once the stream has ended.
    pub fn finish(&mut self) -> Result<Option<String>, FramingError> {
        finish_line(std::mem::take(&mut self.pending))
    }

    fn extend(&mut self, bytes: &[u8]) -> Result<(), FramingError> {
        if self.pending.len() + bytes.len() > self.limit {
            self.pending.clear();
            return Err(FramingError::LineTooLong);
        }
        self.pending.extend_from_slice(bytes);
        Ok(())
    }
}

fn finish_line(mut line: Vec<u8>) -> Result<Option<String>, FramingError> {
    if line.last() == Some(&b'\r') {
        line.pop();
    }
    let text = String::from_utf8(line).map_err(|_| FramingError::InvalidUtf8)?;
    if text.trim().is_empty() {
        Ok(None)
    } else {
        Ok(Some(text))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCRIPT: &str = "{\"type\":\"turn.started\"}\r\n\n{\"text\":\"héllo ✓\"}\n";

    #[test]
    fn frames_identically_at_every_split_point() {
        let bytes = SCRIPT.as_bytes();
        let expected = vec![
            "{\"type\":\"turn.started\"}".to_owned(),
            "{\"text\":\"héllo ✓\"}".to_owned(),
        ];
        for split in 0..=bytes.len() {
            let mut framer = JsonlFramer::new();
            let mut lines = framer.push(&bytes[..split]).expect("first half");
            lines.extend(framer.push(&bytes[split..]).expect("second half"));
            assert_eq!(lines, expected, "split at {split}");
            assert_eq!(framer.finish(), Ok(None));
        }
    }

    #[test]
    fn frames_byte_by_byte() {
        let mut framer = JsonlFramer::new();
        let mut lines = Vec::new();
        for byte in SCRIPT.as_bytes() {
            lines.extend(framer.push(std::slice::from_ref(byte)).expect("byte"));
        }
        assert_eq!(lines.len(), 2);
    }

    #[test]
    fn returns_an_unterminated_final_line() {
        let mut framer = JsonlFramer::new();
        assert!(framer.push(b"{\"a\":1}").expect("chunk").is_empty());
        assert_eq!(framer.finish(), Ok(Some("{\"a\":1}".to_owned())));
    }

    #[test]
    fn rejects_overlong_lines_and_invalid_utf8() {
        let mut framer = JsonlFramer::with_limit(8);
        assert_eq!(framer.push(b"0123456789"), Err(FramingError::LineTooLong));
        let mut framer = JsonlFramer::new();
        assert_eq!(framer.push(b"\xff\xfe\n"), Err(FramingError::InvalidUtf8));
    }
}
