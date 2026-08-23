// opencc-js ships no type declarations; the surface we use is small.
declare module 'opencc-js' {
  export interface ConverterOptions {
    from: string;
    to: string;
  }
  export function Converter(options: ConverterOptions): (text: string) => string;
}
