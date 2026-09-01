/**
 * Shared entity types with no imports — breaks the local-entities ↔ use-entity
 * dependency cycle (both import the type from here instead of each other).
 */
export type EntityRecord = Record<string, unknown>;
