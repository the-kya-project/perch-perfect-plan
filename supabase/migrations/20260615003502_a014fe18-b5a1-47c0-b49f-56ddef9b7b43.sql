
-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles self upsert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- BIRDS
-- =========================================
CREATE TABLE public.birds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT,
  age TEXT,
  sex TEXT,
  photo_url TEXT,
  flight_status TEXT,
  normal_weight NUMERIC,
  normal_weight_min NUMERIC,
  normal_weight_max NUMERIC,
  medical_conditions TEXT,
  medications TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.birds TO authenticated;
GRANT ALL ON public.birds TO service_role;
ALTER TABLE public.birds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "birds owner all" ON public.birds FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER birds_updated_at BEFORE UPDATE ON public.birds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX birds_owner_idx ON public.birds(owner_id);

-- =========================================
-- CARE PLANS (one per bird)
-- =========================================
CREATE TABLE public.care_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bird_id UUID NOT NULL UNIQUE REFERENCES public.birds(id) ON DELETE CASCADE,
  normal_appetite TEXT,
  normal_droppings TEXT,
  normal_noise TEXT,
  normal_activity TEXT,
  normal_sleep TEXT,
  normal_behavior_with_strangers TEXT,
  known_triggers TEXT,
  handling_rules TEXT,
  out_of_cage_rules TEXT,
  food_instructions TEXT,
  water_instructions TEXT,
  fresh_food_removal TEXT,
  treats_allowed TEXT,
  foods_never_allowed TEXT,
  safety_rules TEXT,
  other_pets TEXT,
  cleaning_instructions TEXT,
  off_limits_rooms TEXT,
  when_to_call_owner TEXT,
  when_to_call_vet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.care_plans TO authenticated;
GRANT ALL ON public.care_plans TO service_role;
ALTER TABLE public.care_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "care_plans owner all" ON public.care_plans FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()));
CREATE TRIGGER care_plans_updated_at BEFORE UPDATE ON public.care_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- ROUTINE TASKS
-- =========================================
CREATE TABLE public.routine_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  care_plan_id UUID NOT NULL REFERENCES public.care_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'morning', -- morning/midday/evening/bedtime/custom
  time_of_day TEXT,
  instructions TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  sitter_completable BOOLEAN NOT NULL DEFAULT true,
  guide_card_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routine_tasks TO authenticated;
GRANT ALL ON public.routine_tasks TO service_role;
ALTER TABLE public.routine_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routine_tasks owner all" ON public.routine_tasks FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.care_plans cp JOIN public.birds b ON b.id = cp.bird_id
    WHERE cp.id = care_plan_id AND b.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.care_plans cp JOIN public.birds b ON b.id = cp.bird_id
    WHERE cp.id = care_plan_id AND b.owner_id = auth.uid()
  ));
CREATE INDEX routine_tasks_plan_idx ON public.routine_tasks(care_plan_id);

-- =========================================
-- EMERGENCY CONTACTS (one per bird)
-- =========================================
CREATE TABLE public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bird_id UUID NOT NULL UNIQUE REFERENCES public.birds(id) ON DELETE CASCADE,
  owner_phone TEXT,
  backup_name TEXT,
  backup_phone TEXT,
  avian_vet_name TEXT,
  avian_vet_phone TEXT,
  avian_vet_address TEXT,
  emergency_vet_name TEXT,
  emergency_vet_phone TEXT,
  emergency_vet_address TEXT,
  poison_control TEXT,
  carrier_location TEXT,
  first_aid_kit_location TEXT,
  emergency_authorization TEXT,
  spending_limit TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_contacts TO authenticated;
GRANT ALL ON public.emergency_contacts TO service_role;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emergency_contacts owner all" ON public.emergency_contacts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()));
CREATE TRIGGER emergency_contacts_updated_at BEFORE UPDATE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- SITS
-- =========================================
CREATE TABLE public.sits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bird_id UUID NOT NULL REFERENCES public.birds(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sitter_name TEXT,
  sitter_email TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming', -- upcoming/active/ended
  invite_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  token_expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sits TO authenticated;
GRANT ALL ON public.sits TO service_role;
ALTER TABLE public.sits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sits owner all" ON public.sits FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX sits_owner_idx ON public.sits(owner_id);
CREATE INDEX sits_token_idx ON public.sits(invite_token);

-- =========================================
-- DAILY LOGS (sit_id nullable for owner-only logging)
-- =========================================
CREATE TABLE public.daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sit_id UUID REFERENCES public.sits(id) ON DELETE CASCADE,
  bird_id UUID NOT NULL REFERENCES public.birds(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  alertness_status TEXT,
  food_status TEXT,
  water_status TEXT,
  droppings_status TEXT,
  energy_status TEXT,
  breathing_status TEXT,
  posture_status TEXT,
  behavior_status TEXT,
  injury_status TEXT,
  exposure_status TEXT,
  notes TEXT,
  triage_status TEXT NOT NULL DEFAULT 'green', -- green/yellow/red
  triage_reasons TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_logs TO authenticated;
GRANT ALL ON public.daily_logs TO service_role;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_logs owner all" ON public.daily_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()));
CREATE INDEX daily_logs_bird_idx ON public.daily_logs(bird_id, log_date DESC);
CREATE INDEX daily_logs_sit_idx ON public.daily_logs(sit_id);

-- =========================================
-- TASK COMPLETIONS
-- =========================================
CREATE TABLE public.task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sit_id UUID NOT NULL REFERENCES public.sits(id) ON DELETE CASCADE,
  routine_task_id UUID NOT NULL REFERENCES public.routine_tasks(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(sit_id, routine_task_id, completed_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_completions TO authenticated;
GRANT ALL ON public.task_completions TO service_role;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_completions owner read" ON public.task_completions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sits s WHERE s.id = sit_id AND s.owner_id = auth.uid()));
CREATE INDEX task_completions_sit_idx ON public.task_completions(sit_id, completed_date);

-- =========================================
-- PHOTO LOGS
-- =========================================
CREATE TABLE public.photo_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID REFERENCES public.daily_logs(id) ON DELETE CASCADE,
  bird_id UUID NOT NULL REFERENCES public.birds(id) ON DELETE CASCADE,
  sit_id UUID REFERENCES public.sits(id) ON DELETE SET NULL,
  photo_type TEXT NOT NULL DEFAULT 'other', -- droppings/food/injury/other
  photo_url TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_logs TO authenticated;
GRANT ALL ON public.photo_logs TO service_role;
ALTER TABLE public.photo_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_logs owner all" ON public.photo_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()));
CREATE INDEX photo_logs_bird_idx ON public.photo_logs(bird_id, created_at DESC);

-- =========================================
-- WEIGHT LOGS (year-round)
-- =========================================
CREATE TABLE public.weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bird_id UUID NOT NULL REFERENCES public.birds(id) ON DELETE CASCADE,
  sit_id UUID REFERENCES public.sits(id) ON DELETE SET NULL,
  weight NUMERIC NOT NULL,
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_logs TO authenticated;
GRANT ALL ON public.weight_logs TO service_role;
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weight_logs owner all" ON public.weight_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.birds b WHERE b.id = bird_id AND b.owner_id = auth.uid()));
CREATE INDEX weight_logs_bird_idx ON public.weight_logs(bird_id, logged_at DESC);

-- =========================================
-- GUIDE CARDS (public)
-- =========================================
CREATE TABLE public.guide_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  quick_answer TEXT,
  what_to_check TEXT,
  what_to_do TEXT,
  when_to_call_vet TEXT,
  emergency_level TEXT NOT NULL DEFAULT 'normal', -- normal/yellow/red
  search_keywords TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.guide_cards TO anon, authenticated;
GRANT ALL ON public.guide_cards TO service_role;
ALTER TABLE public.guide_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guide_cards public read" ON public.guide_cards FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX guide_cards_category_idx ON public.guide_cards(category);
