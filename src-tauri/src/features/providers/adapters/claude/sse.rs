//! Incremental server-sent events parser (issue #25).
//!
//! HTTP chunks arrive at arbitrary byte boundaries — mid-line, mid-UTF-8
//! sequence or mid-event — so bytes are buffered until a full line is
//! available. Lines follow the SSE grammar: `field: value` (one optional
//! leading space stripped), `:` comments ignored, `data:` lines of one event
//! joined with `\n`, and a blank line dispatching the event. `\n` and `\r\n`
//! line endings are both accepted.
//!
//! The buffer is bounded so a peer that never sends a newline cannot grow
//! memory without limit (Limits tier on vendor input).

/// Largest single line (or unterminated tail) the parser will buffer.
pub const MAX_LINE_BYTES: usize = 1024 * 1024;

/// Largest accumulated `data` payload of one event.
pub const MAX_EVENT_BYTES: usize = 4 * 1024 * 1024;

/// One dispatched server-sent event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    /// The `event:` field, when the server sent one.
    pub event: Option<String>,
    /// Every `data:` line of the event, joined with `\n`.
    pub data: String,
}

/// Why the byte stream cannot be parsed as SSE.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SseError {
    LineTooLong,
    EventTooLarge,
    InvalidUtf8,
}

/// Stateful parser fed with raw response chunks.
#[derive(Debug, Default)]
pub struct SseParser {
    buffer: Vec<u8>,
    event: Option<String>,
    data: String,
    has_data: bool,
}

impl SseParser {
    pub fn new() -> Self {
        Self::default()
    }

    /// Consumes one chunk and returns every event it completed, in order.
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<SseEvent>, SseError> {
        self.buffer.extend_from_slice(chunk);
        let mut events = Vec::new();
        let mut consumed = 0;
        while let Some(offset) = self.buffer[consumed..]
            .iter()
            .position(|byte| *byte == b'\n')
        {
            let end = consumed + offset;
            let mut line = &self.buffer[consumed..end];
            if let Some(stripped) = line.strip_suffix(b"\r") {
                line = stripped;
            }
            if line.len() > MAX_LINE_BYTES {
                return Err(SseError::LineTooLong);
            }
            let line = std::str::from_utf8(line)
                .map_err(|_| SseError::InvalidUtf8)?
                .to_owned();
            consumed = end + 1;
            if let Some(event) = self.process_line(&line)? {
                events.push(event);
            }
        }
        self.buffer.drain(..consumed);
        if self.buffer.len() > MAX_LINE_BYTES {
            return Err(SseError::LineTooLong);
        }
        Ok(events)
    }

    fn process_line(&mut self, line: &str) -> Result<Option<SseEvent>, SseError> {
        if line.is_empty() {
            return Ok(self.dispatch());
        }
        if line.starts_with(':') {
            return Ok(None);
        }
        let (field, value) = match line.split_once(':') {
            Some((field, value)) => (field, value.strip_prefix(' ').unwrap_or(value)),
            None => (line, ""),
        };
        match field {
            "event" => self.event = Some(value.to_owned()),
            "data" => {
                if self.has_data {
                    self.data.push('\n');
                }
                self.data.push_str(value);
                self.has_data = true;
                if self.data.len() > MAX_EVENT_BYTES {
                    return Err(SseError::EventTooLarge);
                }
            }
            // `id` and `retry` carry no meaning for a one-shot POST stream.
            _ => {}
        }
        Ok(None)
    }

    fn dispatch(&mut self) -> Option<SseEvent> {
        let event = self.event.take();
        if !self.has_data {
            return None;
        }
        self.has_data = false;
        Some(SseEvent {
            event,
            data: std::mem::take(&mut self.data),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(name: &str, data: &str) -> SseEvent {
        SseEvent {
            event: Some(name.to_owned()),
            data: data.to_owned(),
        }
    }

    #[test]
    fn parses_complete_events_in_one_chunk() {
        let mut parser = SseParser::new();
        let events = parser
            .push(b"event: ping\ndata: {\"type\":\"ping\"}\n\nevent: message_stop\ndata: {}\n\n")
            .expect("valid stream");
        assert_eq!(
            events,
            vec![
                event("ping", "{\"type\":\"ping\"}"),
                event("message_stop", "{}")
            ]
        );
    }

    #[test]
    fn reassembles_events_split_across_arbitrary_chunks() {
        let stream = "event: content_block_delta\ndata: {\"text\":\"héllo\"}\n\n".as_bytes();
        // Every split point, including inside the two-byte `é`.
        for split in 0..stream.len() {
            let mut parser = SseParser::new();
            let mut events = parser.push(&stream[..split]).expect("first half");
            events.extend(parser.push(&stream[split..]).expect("second half"));
            assert_eq!(
                events,
                vec![event("content_block_delta", "{\"text\":\"héllo\"}")],
                "split at {split}"
            );
        }
    }

    #[test]
    fn byte_by_byte_feeding_yields_the_same_events() {
        let stream = b"event: a\ndata: 1\n\nevent: b\ndata: 2\n\n";
        let mut parser = SseParser::new();
        let mut events = Vec::new();
        for byte in stream {
            events.extend(parser.push(&[*byte]).expect("valid byte"));
        }
        assert_eq!(events, vec![event("a", "1"), event("b", "2")]);
    }

    #[test]
    fn joins_multi_line_data_and_accepts_crlf() {
        let mut parser = SseParser::new();
        let events = parser
            .push(b"event: multi\r\ndata: first\r\ndata:second\r\n\r\n")
            .expect("valid stream");
        assert_eq!(events, vec![event("multi", "first\nsecond")]);
    }

    #[test]
    fn ignores_comments_unknown_fields_and_dataless_events() {
        let mut parser = SseParser::new();
        let events = parser
            .push(b": keep-alive\nid: 7\nretry: 100\n\nevent: lonely\n\ndata: only-data\n\n")
            .expect("valid stream");
        assert_eq!(
            events,
            vec![SseEvent {
                event: None,
                data: "only-data".to_owned(),
            }]
        );
    }

    #[test]
    fn holds_an_unterminated_event_until_its_blank_line() {
        let mut parser = SseParser::new();
        assert!(
            parser
                .push(b"event: x\ndata: 1\n")
                .expect("partial")
                .is_empty()
        );
        assert_eq!(parser.push(b"\n").expect("dispatch"), vec![event("x", "1")]);
    }

    #[test]
    fn rejects_unbounded_lines_and_invalid_utf8() {
        let mut parser = SseParser::new();
        let oversized = vec![b'a'; MAX_LINE_BYTES + 1];
        assert_eq!(parser.push(&oversized), Err(SseError::LineTooLong));

        let mut parser = SseParser::new();
        assert_eq!(parser.push(b"data: \xff\n"), Err(SseError::InvalidUtf8));
    }
}
