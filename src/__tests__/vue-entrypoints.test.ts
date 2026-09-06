import { flushPromises, shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../utils/authentification.ts', () => ({
  default: class {
    async signIn() {}
  },
}))

import Home from '../pages/Home.vue'
import Main from '../pages/Main.vue'

describe('popup entry views', () => {
  it('renders the anonymous sign-in surface', () => {
    const wrapper = shallowMount(Home, {
      global: { provide: { app_name: 'MidoriVPN' } },
    })

    expect(wrapper.get('button').text()).toContain('Sign in to Midori VPN')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('renders the authenticated server and connection controls', async () => {
    const wrapper = shallowMount(Main, {
      global: { provide: { app_name: 'MidoriVPN' } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Virtual Location')
    expect(wrapper.text()).toContain('Midori VPN Desktop')
  })
})
