import { renderToStaticMarkup } from 'react-dom/server';
import { AppSidebar } from '../components/AppSidebar';

test('renders the desktop shell with labeled navigation', () => {
  const html = renderToStaticMarkup(<AppSidebar pathname="/" />);

  expect(html).toContain('aria-label="Primary navigation"');
  expect(html).toContain('Home');
  expect(html).toContain('Schedule');
});
