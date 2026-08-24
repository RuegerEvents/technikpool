import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { parse } from 'yaml';
// The spec is the contract; serving it from the same file the types and the
// Dart client are generated from means the docs can't drift from either.
import spec from '../../../../../openapi.yaml?raw';

const parsed = parse(spec) as unknown;

export const GET: RequestHandler = () => json(parsed);
