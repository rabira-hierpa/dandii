import { z } from "zod";
import { OPERATOR_CODES } from "@/lib/operators";

/** GTFS route_type values we accept (see ROUTE_TYPES in @/types/console). */
const ROUTE_TYPE_VALUES: number[] = [0, 1, 2, 3, 4, 5, 7, 11];

/** GTFS continuous_pickup / continuous_drop_off. */
const CONTINUOUS_VALUES: number[] = [0, 1, 2, 3];

/**
 * Membership checks rather than literal unions: the form holds a plain `number`
 * (a select yields a string it parses), and forcing the union all the way up
 * would mean casting at every call site — which defeats the validation.
 */
const routeType = z
  .number()
  .int()
  .refine((v) => ROUTE_TYPE_VALUES.includes(v), "Unknown route type");
const continuous = z
  .number()
  .int()
  .refine((v) => CONTINUOUS_VALUES.includes(v), "Unknown flag-stop value");

/** 6-digit hex without the leading "#", as GTFS route_color requires. */
const hexColor = z
  .string()
  .regex(/^[0-9A-Fa-f]{6}$/, "Use a 6-digit hex colour, e.g. D97706");

/**
 * A route edit. Every field is optional-and-nullable: absent means "leave this
 * override alone", explicit null means "clear the override so the base feed
 * value comes back". Those are different operations and the form needs both.
 */
export const routeEditSchema = z.object({
  routeId: z.string().min(1),
  shortName: z.string().trim().min(1).max(64).nullish(),
  longName: z.string().trim().min(1).max(255).nullish(),
  desc: z.string().trim().max(1000).nullish(),
  url: z.string().trim().url("Enter a full URL, e.g. https://…").max(500).nullish(),
  type: routeType.nullish(),
  color: hexColor.nullish(),
  textColor: hexColor.nullish(),
  operatorCode: z.enum(OPERATOR_CODES).nullish(),
  continuousPickup: continuous.nullish(),
  continuousDropOff: continuous.nullish(),
});

/** A route created in the console. Requires what GTFS requires, nothing more. */
export const routeCreateSchema = z.object({
  shortName: z.string().trim().min(1).max(64),
  longName: z.string().trim().min(1).max(255),
  type: routeType,
  operatorCode: z.enum(OPERATOR_CODES),
  desc: z.string().trim().max(1000).optional(),
  color: hexColor.optional(),
  textColor: hexColor.optional(),
});

export const routeIdSchema = z.object({ routeId: z.string().min(1) });

export type RouteEditInput = z.input<typeof routeEditSchema>;
export type RouteCreateInput = z.input<typeof routeCreateSchema>;

export { ROUTE_TYPE_VALUES, CONTINUOUS_VALUES };
