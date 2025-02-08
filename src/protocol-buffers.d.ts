declare module 'protocol-buffers' {
  export default function (schema: Buffer): {
    [key: string]: {
      decode: <T>(data: Buffer) => T;
      encode: <T>(data: T) => Buffer;
    }
  }
}
