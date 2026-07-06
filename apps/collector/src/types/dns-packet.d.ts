/**
 * Type declarations for dns-packet library.
 * dns-packet does not ship its own types.
 */
declare module 'dns-packet' {
  export interface Record {
    name: string;
    type: string;
    ttl?: number;
    class?: string;
    data?: unknown;
    flags?: number;
    algorithm?: number;
    publicKey?: string;
    keyTag?: number;
    digestType?: number;
    digest?: string;
  }

  export interface Question {
    name: string;
    type: string | number;
    class?: string;
  }

  export interface Packet {
    id?: number;
    type?: string;
    flags?: number;
    rcode?: number | string;
    questions?: Question[];
    answers?: Record[];
    authorities?: Record[];
    additionals?: Record[];
  }

  export interface PrepareQueryOptions {
    type?: number;
    name?: string;
    id?: number;
    flags?: number;
    questions?: Question[];
  }

  export function encode(packet: Packet): Buffer;
  export function decode(buf: Buffer): Packet;
  export function parse(buf: Buffer): Packet;
  export function prepareQuery(opts: PrepareQueryOptions): Buffer;

  export const AUTHORITATIVE_ANSWER: number;
  export const TRUNCATED_RESPONSE: number;
  export const RECURSION_DESIRED: number;
  export const RECURSION_AVAILABLE: number;
  export const AUTHENTICATED_DATA: number;
  export const AUTHENTIC_DATA: number;
  export const CHECKING_DISABLED: number;
}
