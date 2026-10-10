import readme from '../../README.md?raw'
import schemaSql from '../../supabase/schema.sql?raw'
import settingsSql from '../../supabase/restaurant-settings.sql?raw'
import kotSql from '../../supabase/kot-printing.sql?raw'
import billSql from '../../supabase/bill-printing.sql?raw'
import paymentSql from '../../supabase/bill-payments.sql?raw'
import viteConfig from '../../vite.config.js?raw'

export const QA_README = String(readme || '')
export const QA_VITE_CONFIG = String(viteConfig || '')

export const QA_SQL_FILES = {
  'supabase/schema.sql': String(schemaSql || ''),
  'supabase/restaurant-settings.sql': String(settingsSql || ''),
  'supabase/kot-printing.sql': String(kotSql || ''),
  'supabase/bill-printing.sql': String(billSql || ''),
  'supabase/bill-payments.sql': String(paymentSql || ''),
}
