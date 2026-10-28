export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(
      data.message || data.error || `Request failed (${response.status})`,
    )
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}