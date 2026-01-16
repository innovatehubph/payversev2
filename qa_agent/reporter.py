#!/usr/bin/env python3
"""
ZARAH - Test Report Generator

Generates comprehensive test reports in multiple formats.
"""

import json
import os
from datetime import datetime
from typing import Any

from .scenarios import TestSuite, TestResult, StepResult


class TestReporter:
    """
    Generates test reports in various formats.

    Supports HTML, JSON, and console output.
    """

    def __init__(self, output_dir: str = "./qa_reports"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_report(
        self,
        suite: TestSuite,
        results: list[TestResult],
        format: str = "all"
    ) -> str:
        """Generate test report in specified format(s)."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"{suite.name.replace(' ', '_')}_{timestamp}"

        paths = []

        if format in ("all", "html"):
            html_path = self._generate_html_report(suite, results, base_name)
            paths.append(html_path)

        if format in ("all", "json"):
            json_path = self._generate_json_report(suite, results, base_name)
            paths.append(json_path)

        if format in ("all", "console"):
            self._print_console_report(suite, results)

        return paths[0] if paths else ""

    def _calculate_stats(self, results: list[TestResult]) -> dict:
        """Calculate test statistics."""
        total_scenarios = len(results)
        passed_scenarios = len([r for r in results if r.status == "passed"])
        failed_scenarios = len([r for r in results if r.status == "failed"])
        error_scenarios = len([r for r in results if r.status == "error"])

        total_steps = sum(r.total_steps for r in results)
        passed_steps = sum(r.passed_steps for r in results)
        failed_steps = sum(r.failed_steps for r in results)

        total_duration = sum(r.duration for r in results)

        pass_rate = (passed_scenarios / total_scenarios * 100) if total_scenarios > 0 else 0

        return {
            "total_scenarios": total_scenarios,
            "passed_scenarios": passed_scenarios,
            "failed_scenarios": failed_scenarios,
            "error_scenarios": error_scenarios,
            "total_steps": total_steps,
            "passed_steps": passed_steps,
            "failed_steps": failed_steps,
            "total_duration": total_duration,
            "pass_rate": pass_rate,
        }

    def _generate_html_report(
        self,
        suite: TestSuite,
        results: list[TestResult],
        base_name: str
    ) -> str:
        """Generate HTML test report."""
        stats = self._calculate_stats(results)

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZARAH Test Report - {suite.name}</title>
    <style>
        :root {{
            --primary: #6366f1;
            --success: #22c55e;
            --error: #ef4444;
            --warning: #f59e0b;
            --bg: #0f172a;
            --bg-card: #1e293b;
            --text: #e2e8f0;
            --text-muted: #94a3b8;
            --border: #334155;
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            padding: 2rem;
        }}

        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}

        header {{
            text-align: center;
            margin-bottom: 3rem;
            padding: 2rem;
            background: linear-gradient(135deg, var(--bg-card), var(--bg));
            border-radius: 1rem;
            border: 1px solid var(--border);
        }}

        .logo {{
            font-size: 3rem;
            font-weight: bold;
            background: linear-gradient(135deg, var(--primary), #a855f7);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 0.5rem;
        }}

        .subtitle {{
            color: var(--text-muted);
            font-size: 1.1rem;
        }}

        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }}

        .stat-card {{
            background: var(--bg-card);
            border-radius: 1rem;
            padding: 1.5rem;
            text-align: center;
            border: 1px solid var(--border);
            transition: transform 0.2s, box-shadow 0.2s;
        }}

        .stat-card:hover {{
            transform: translateY(-2px);
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }}

        .stat-value {{
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 0.5rem;
        }}

        .stat-label {{
            color: var(--text-muted);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }}

        .stat-success {{ color: var(--success); }}
        .stat-error {{ color: var(--error); }}
        .stat-warning {{ color: var(--warning); }}
        .stat-primary {{ color: var(--primary); }}

        .progress-ring {{
            width: 120px;
            height: 120px;
            margin: 0 auto 1rem;
        }}

        .progress-ring circle {{
            fill: none;
            stroke-width: 8;
        }}

        .progress-ring .bg {{
            stroke: var(--border);
        }}

        .progress-ring .progress {{
            stroke: var(--success);
            stroke-linecap: round;
            transform: rotate(-90deg);
            transform-origin: 50% 50%;
            transition: stroke-dashoffset 0.5s;
        }}

        .progress-text {{
            font-size: 1.5rem;
            font-weight: bold;
        }}

        .section {{
            margin-bottom: 2rem;
        }}

        .section-title {{
            font-size: 1.5rem;
            margin-bottom: 1.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--border);
        }}

        .scenario {{
            background: var(--bg-card);
            border-radius: 1rem;
            margin-bottom: 1.5rem;
            border: 1px solid var(--border);
            overflow: hidden;
        }}

        .scenario-header {{
            padding: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            transition: background 0.2s;
        }}

        .scenario-header:hover {{
            background: rgba(255,255,255,0.02);
        }}

        .scenario-name {{
            font-size: 1.2rem;
            font-weight: 600;
        }}

        .scenario-meta {{
            display: flex;
            gap: 1rem;
            color: var(--text-muted);
            font-size: 0.9rem;
        }}

        .status-badge {{
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
        }}

        .status-passed {{
            background: rgba(34, 197, 94, 0.2);
            color: var(--success);
        }}

        .status-failed {{
            background: rgba(239, 68, 68, 0.2);
            color: var(--error);
        }}

        .status-error {{
            background: rgba(245, 158, 11, 0.2);
            color: var(--warning);
        }}

        .scenario-details {{
            padding: 0 1.5rem 1.5rem;
            display: none;
        }}

        .scenario.expanded .scenario-details {{
            display: block;
        }}

        .step {{
            display: flex;
            align-items: center;
            padding: 0.75rem;
            border-radius: 0.5rem;
            margin-bottom: 0.5rem;
            background: rgba(0,0,0,0.2);
        }}

        .step-icon {{
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 1rem;
            font-size: 0.8rem;
        }}

        .step-passed .step-icon {{
            background: var(--success);
            color: white;
        }}

        .step-failed .step-icon {{
            background: var(--error);
            color: white;
        }}

        .step-error .step-icon {{
            background: var(--warning);
            color: white;
        }}

        .step-info {{
            flex: 1;
        }}

        .step-name {{
            font-weight: 500;
        }}

        .step-action {{
            color: var(--text-muted);
            font-size: 0.85rem;
        }}

        .step-duration {{
            color: var(--text-muted);
            font-size: 0.85rem;
        }}

        .step-message {{
            color: var(--error);
            font-size: 0.85rem;
            margin-top: 0.25rem;
        }}

        footer {{
            text-align: center;
            padding: 2rem;
            color: var(--text-muted);
            font-size: 0.9rem;
        }}

        .expand-icon {{
            transition: transform 0.2s;
        }}

        .scenario.expanded .expand-icon {{
            transform: rotate(180deg);
        }}

        @media (max-width: 768px) {{
            body {{
                padding: 1rem;
            }}

            .stats-grid {{
                grid-template-columns: repeat(2, 1fr);
            }}

            .scenario-header {{
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">ZARAH</div>
            <div class="subtitle">Expert Browser QA Testing Agent - Test Report</div>
            <p style="margin-top: 1rem; color: var(--text-muted);">
                Suite: <strong>{suite.name}</strong> |
                Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
            </p>
        </header>

        <div class="stats-grid">
            <div class="stat-card">
                <svg class="progress-ring" viewBox="0 0 120 120">
                    <circle class="bg" cx="60" cy="60" r="52"/>
                    <circle class="progress" cx="60" cy="60" r="52"
                        stroke-dasharray="327"
                        stroke-dashoffset="{327 - (327 * stats['pass_rate'] / 100)}"/>
                </svg>
                <div class="progress-text stat-success">{stats['pass_rate']:.1f}%</div>
                <div class="stat-label">Pass Rate</div>
            </div>

            <div class="stat-card">
                <div class="stat-value stat-primary">{stats['total_scenarios']}</div>
                <div class="stat-label">Total Scenarios</div>
            </div>

            <div class="stat-card">
                <div class="stat-value stat-success">{stats['passed_scenarios']}</div>
                <div class="stat-label">Passed</div>
            </div>

            <div class="stat-card">
                <div class="stat-value stat-error">{stats['failed_scenarios']}</div>
                <div class="stat-label">Failed</div>
            </div>

            <div class="stat-card">
                <div class="stat-value stat-primary">{stats['total_steps']}</div>
                <div class="stat-label">Total Steps</div>
            </div>

            <div class="stat-card">
                <div class="stat-value stat-warning">{stats['total_duration']:.1f}s</div>
                <div class="stat-label">Duration</div>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">Test Results</h2>
            {self._generate_scenarios_html(results)}
        </div>

        <footer>
            <p>Generated by ZARAH - Expert Browser QA Testing Agent</p>
            <p>Powered by MCP Browser Automation</p>
        </footer>
    </div>

    <script>
        document.querySelectorAll('.scenario-header').forEach(header => {{
            header.addEventListener('click', () => {{
                header.parentElement.classList.toggle('expanded');
            }});
        }});
    </script>
</body>
</html>"""

        filepath = os.path.join(self.output_dir, f"{base_name}.html")
        with open(filepath, "w") as f:
            f.write(html)

        return filepath

    def _generate_scenarios_html(self, results: list[TestResult]) -> str:
        """Generate HTML for scenario results."""
        html_parts = []

        for result in results:
            status_class = f"status-{result.status}"
            steps_html = self._generate_steps_html(result.step_results)

            html_parts.append(f"""
            <div class="scenario">
                <div class="scenario-header">
                    <div>
                        <div class="scenario-name">{result.scenario.name}</div>
                        <div class="scenario-meta">
                            <span>{result.total_steps} steps</span>
                            <span>{result.duration:.2f}s</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span class="status-badge {status_class}">{result.status}</span>
                        <span class="expand-icon">▼</span>
                    </div>
                </div>
                <div class="scenario-details">
                    <p style="color: var(--text-muted); margin-bottom: 1rem;">
                        {result.scenario.description}
                    </p>
                    {steps_html}
                </div>
            </div>""")

        return "\n".join(html_parts)

    def _generate_steps_html(self, step_results: list[StepResult]) -> str:
        """Generate HTML for step results."""
        html_parts = []

        for sr in step_results:
            icon = "✓" if sr.status == "passed" else "✗" if sr.status == "failed" else "!"
            step_class = f"step-{sr.status}"

            message_html = ""
            if sr.message:
                message_html = f'<div class="step-message">{sr.message}</div>'

            html_parts.append(f"""
            <div class="step {step_class}">
                <div class="step-icon">{icon}</div>
                <div class="step-info">
                    <div class="step-name">{sr.step.name}</div>
                    <div class="step-action">{sr.step.action}: {sr.step.target or ''}</div>
                    {message_html}
                </div>
                <div class="step-duration">{sr.duration:.2f}s</div>
            </div>""")

        return "\n".join(html_parts)

    def _generate_json_report(
        self,
        suite: TestSuite,
        results: list[TestResult],
        base_name: str
    ) -> str:
        """Generate JSON test report."""
        stats = self._calculate_stats(results)

        report = {
            "suite": suite.to_dict(),
            "generated_at": datetime.now().isoformat(),
            "statistics": stats,
            "results": [r.to_dict() for r in results],
        }

        filepath = os.path.join(self.output_dir, f"{base_name}.json")
        with open(filepath, "w") as f:
            json.dump(report, f, indent=2, default=str)

        return filepath

    def _print_console_report(self, suite: TestSuite, results: list[TestResult]):
        """Print test report to console."""
        stats = self._calculate_stats(results)

        print("\n" + "=" * 70)
        print("  ZARAH - Test Report")
        print("=" * 70)
        print(f"\n  Suite: {suite.name}")
        print(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        print("\n" + "-" * 70)
        print("  SUMMARY")
        print("-" * 70)
        print(f"  Total Scenarios:  {stats['total_scenarios']}")
        print(f"  Passed:           {stats['passed_scenarios']} ✓")
        print(f"  Failed:           {stats['failed_scenarios']} ✗")
        print(f"  Errors:           {stats['error_scenarios']} !")
        print(f"  Pass Rate:        {stats['pass_rate']:.1f}%")
        print(f"  Total Duration:   {stats['total_duration']:.2f}s")

        print("\n" + "-" * 70)
        print("  RESULTS")
        print("-" * 70)

        for result in results:
            icon = "✓" if result.status == "passed" else "✗" if result.status == "failed" else "!"
            print(f"\n  {icon} {result.scenario.name}")
            print(f"    Status: {result.status.upper()}")
            print(f"    Steps: {result.passed_steps}/{result.total_steps} passed")
            print(f"    Duration: {result.duration:.2f}s")

            # Show failed steps
            failed = [sr for sr in result.step_results if sr.status != "passed"]
            if failed:
                print("    Failed Steps:")
                for sr in failed[:3]:  # Show max 3 failures
                    print(f"      - {sr.step.name}: {sr.message or sr.status}")

        print("\n" + "=" * 70)
        print("  Report generated by ZARAH - Expert Browser QA Testing Agent")
        print("=" * 70 + "\n")
