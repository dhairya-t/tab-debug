import { TabDebug } from '@dhairya-t/tab-debug/next';
import { Counter } from './counter';
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TabDebug>
          <Counter />
          {children}
        </TabDebug>
      </body>
    </html>
  );
}
