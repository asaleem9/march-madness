ALTER TABLE "bracket_picks" DROP CONSTRAINT "bracket_picks_bracket_id_brackets_id_fk";
--> statement-breakpoint
ALTER TABLE "brackets" DROP CONSTRAINT "brackets_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_queue" DROP CONSTRAINT "notification_queue_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications_log" DROP CONSTRAINT "notifications_log_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "user_achievements" DROP CONSTRAINT "user_achievements_user_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "bracket_picks" ADD CONSTRAINT "bracket_picks_bracket_id_brackets_id_fk" FOREIGN KEY ("bracket_id") REFERENCES "public"."brackets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brackets" ADD CONSTRAINT "brackets_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;