import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  country: text("country"),
  state: text("state"),
  source: text("source").notNull(), // 'gps' or 'search'
  createdAt: timestamp("created_at").defaultNow(),
});

export const storms = pgTable("storms", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  intensity: real("intensity").notNull(), // dBZ
  distance: real("distance").notNull(), // miles from location
  direction: integer("direction").notNull(), // degrees
  speed: real("speed").notNull(), // mph
  type: text("type").notNull(),
  description: text("description"),
  detectedAt: timestamp("detected_at").defaultNow(),
});

export const weatherAlerts = pgTable("weather_alerts", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull(),
  event: text("event").notNull(),
  severity: text("severity").notNull(),
  headline: text("headline"),
  description: text("description"),
  sent: timestamp("sent").notNull(),
  expires: timestamp("expires"),
  areas: text("areas"),
});

// Storm tracking history for movement analysis
export const stormHistory = pgTable("storm_history", {
  id: serial("id").primaryKey(),
  stormId: text("storm_id").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  intensity: real("intensity").notNull(), // dBZ
  direction: integer("direction").notNull(), // degrees
  speed: real("speed").notNull(), // mph
  timestamp: timestamp("timestamp").defaultNow(),
});

// Storm movement vectors for prediction
export const stormMovement = pgTable("storm_movement", {
  id: serial("id").primaryKey(),
  stormId: text("storm_id").notNull(),
  velocityX: real("velocity_x").notNull(), // mph eastward
  velocityY: real("velocity_y").notNull(), // mph northward
  acceleration: real("acceleration").notNull(), // mph²
  intensityTrend: text("intensity_trend").notNull(), // 'strengthening', 'weakening', 'steady'
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User preferences for clustering and alerts
export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  clusterSensitivity: real("cluster_sensitivity").default(1.0), // 0.1 to 2.0
  alertRadius: real("alert_radius").default(30.0), // miles
  minAlertIntensity: real("min_alert_intensity").default(45.0), // dBZ
  showStormTrails: boolean("show_storm_trails").default(true),
  animationSpeed: real("animation_speed").default(1.0), // 0.5 to 3.0
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
});

export const insertStormSchema = createInsertSchema(storms).omit({
  id: true,
  detectedAt: true,
});

export const insertWeatherAlertSchema = createInsertSchema(weatherAlerts).omit({
  id: true,
});

// Location search schema
export const locationSearchSchema = z.object({
  query: z.string().min(1, "Search query is required"),
});

// Weather data request schema
export const weatherDataRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radius: z.number().min(5).max(50).default(30),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type Storm = typeof storms.$inferSelect;
export type InsertStorm = z.infer<typeof insertStormSchema>;

export type WeatherAlert = typeof weatherAlerts.$inferSelect;
export type InsertWeatherAlert = z.infer<typeof insertWeatherAlertSchema>;

export type LocationSearchRequest = z.infer<typeof locationSearchSchema>;
export type WeatherDataRequest = z.infer<typeof weatherDataRequestSchema>;
