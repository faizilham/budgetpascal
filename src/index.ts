import { Emitter } from "./emitter";
import { ErrLogger } from "./errors";
import { Parser } from "./parser";

export function compile(source: string, logger: ErrLogger.Reporter = ErrLogger.logger, optimize = true, debug = true) : Uint8Array | undefined {
  const parser = new Parser(source, logger);
  const program = parser.parse();

  if (!program) {
    return;
  }

  try {
    const emitter = new Emitter(program);
    const binary = emitter.emit(optimize, debug);
    return binary;
  } catch (e: any) {
    logger.error(e);
  }
}
