import { ErrLogger } from "../errors";

export class MockLogger implements ErrLogger.Reporter {
  lines: string[] = []

  error(...messages: any[]): void {
    this.lines.push(messages.join(' '));
  }
}
