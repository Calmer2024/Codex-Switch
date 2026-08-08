import type { Writable } from "node:stream";

export function isBrokenPipeError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "EPIPE";
}

export function installBrokenPipeGuards(onBrokenPipe: () => void): () => void {
  let handled = false;
  const handleBrokenPipe = (error: unknown): boolean => {
    if (!isBrokenPipeError(error)) {
      return false;
    }
    if (!handled) {
      handled = true;
      onBrokenPipe();
    }
    return true;
  };
  const onStreamError = (error: Error): void => {
    handleBrokenPipe(error);
  };
  const onUncaughtException = (error: Error): void => {
    handleBrokenPipe(error);
  };

  process.stdout.on("error", onStreamError);
  process.stderr.on("error", onStreamError);
  process.prependListener("uncaughtException", onUncaughtException);

  return () => {
    process.stdout.off("error", onStreamError);
    process.stderr.off("error", onStreamError);
    process.off("uncaughtException", onUncaughtException);
  };
}

export function writeStreamSafely(stream: Writable, content: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    stream.write(content, (error?: Error | null) => {
      if (!error) {
        resolve(true);
      } else if (isBrokenPipeError(error)) {
        resolve(false);
      } else {
        reject(error);
      }
    });
  });
}
