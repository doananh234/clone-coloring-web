declare const __brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type EntityId<Entity extends string = string> = Brand<string, Entity>;

export function createId<E extends string>(id: string): EntityId<E> {
  return id as EntityId<E>;
}

export type UserId = EntityId<"User">;
