import type { FaqItem } from '~/data/faq';

export function buildOrgSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Iloilo Science and Technology University (ISAT U) and Community Multi-Purpose Cooperative',
    alternateName: 'ISATUCMPC',
    url: 'https://isatucmpc.coop',
    logo: 'https://isatucmpc.coop/logo.svg',
    foundingDate: '1964',
    sameAs: ['https://www.facebook.com/isatu.cmpc'],
    contactPoint: [{
      '@type': 'ContactPoint',
      telephone: '+63-33-330-2586',
      contactType: 'customer service',
      email: 'isatucmpc1964@gmail.com',
      areaServed: 'PH',
      availableLanguage: ['English', 'Hiligaynon', 'Filipino'],
    }],
  };
}

export function buildLocalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'ISATUCMPC',
    image: 'https://isatucmpc.coop/og-default.png',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Magdalo St., La Paz',
      addressLocality: 'Iloilo City',
      addressRegion: 'Iloilo',
      postalCode: '5000',
      addressCountry: 'PH',
    },
    telephone: '+63-33-330-2586',
    email: 'isatucmpc1964@gmail.com',
    url: 'https://isatucmpc.coop',
  };
}

export function buildFaqSchema(faqs: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
