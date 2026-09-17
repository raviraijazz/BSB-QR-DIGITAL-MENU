import { supabase } from './supabase'

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

export async function uploadAsset(userId, file, path) {
  if (!file) return { url: null, error: 'No file selected' }
  if (!ALLOWED.includes(file.type)) {
    return { url: null, error: 'Use a JPG, PNG or WebP image' }
  }
  if (file.size > MAX_BYTES) {
    return { url: null, error: 'Image must be under 2MB' }
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const fullPath = `${userId}/${path}.${ext}`

  const { error } = await supabase.storage
    .from('menu-assets')
    .upload(fullPath, file, { upsert: true, contentType: file.type })

  if (error) return { url: null, error: error.message }

  const { data } = supabase.storage.from('menu-assets').getPublicUrl(fullPath)
  return { url: `${data.publicUrl}?t=${Date.now()}`, error: null }
}
