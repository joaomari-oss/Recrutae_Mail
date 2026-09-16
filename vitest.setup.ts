import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without `globals`, so Testing Library cannot register its own
// auto-cleanup. Without this, mounted trees pile up and later queries match
// leftovers from earlier tests.
afterEach(cleanup)
