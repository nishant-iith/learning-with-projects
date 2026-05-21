import pytest
from datetime import datetime, timezone
from analyzer.log_analyzer import LogAnalyzer, LogEntry

def test_parse_common_log_line():
    analyzer = LogAnalyzer()
    line = '192.168.1.1 - - [21/May/2026:16:45:00 +0000] "GET /api/users HTTP/1.1" 200 512'
    entry = analyzer.parse_line(line, is_json=False)
    
    assert entry is not None
    assert entry.ip == "192.168.1.1"
    assert entry.method == "GET"
    assert entry.path == "/api/users"
    assert entry.status == 200
    assert entry.bytes_sent == 512
    assert entry.timestamp.year == 2026

def test_parse_json_log_line():
    analyzer = LogAnalyzer()
    line = '{"ip": "10.0.0.5", "timestamp": "2026-05-21T16:45:00Z", "method": "POST", "path": "/checkout", "status": 201, "bytes": 1024}'
    entry = analyzer.parse_line(line, is_json=True)
    
    assert entry is not None
    assert entry.ip == "10.0.0.5"
    assert entry.method == "POST"
    assert entry.status == 201
    assert entry.bytes_sent == 1024

def test_aggregation_metrics(tmp_path):
    # Setup dummy log file
    log_content = (
        '192.168.1.1 - - [21/May/2026:16:45:00 +0000] "GET /index.html HTTP/1.1" 200 100\n'
        '192.168.1.1 - - [21/May/2026:16:46:00 +0000] "GET /index.html HTTP/1.1" 200 100\n'
        '10.0.0.1 - - [21/May/2026:16:47:00 +0000] "POST /api/login HTTP/1.1" 401 50\n'
    )
    log_file = tmp_path / "access.log"
    log_file.write_text(log_content)
    
    analyzer = LogAnalyzer()
    results = analyzer.analyze(str(log_file))
    
    assert results["total_requests"] == 3
    assert results["total_bytes"] == 250
    assert results["status_distribution"][200] == 2
    assert results["status_distribution"][401] == 1
    assert results["top_ips"][0] == ("192.168.1.1", 2)
