import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vite-plus/test';

import { AlertDialog, AlertDialogContent, AlertDialogTrigger } from './alert-dialog';
import { Sheet, SheetContent, SheetTrigger } from './sheet';
import { Switch } from './switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

// These four primitives wrap Base UI. Nothing else in the suite renders them,
// so this covers the wiring (state props, portalled content, thumb slot) that
// a Base UI upgrade is most likely to break.

test('Switch reflects checked state and reports changes', async () => {
  const onCheckedChange = vi.fn();
  const { rerender } = render(<Switch checked={false} onCheckedChange={onCheckedChange} />);

  const toggle = screen.getByRole('switch');
  expect(toggle).toHaveAttribute('data-unchecked');

  await userEvent.click(toggle);
  expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());

  rerender(<Switch checked onCheckedChange={onCheckedChange} />);
  expect(screen.getByRole('switch')).toHaveAttribute('data-checked');
});

test('Tooltip renders trigger and reveals portalled content on hover', async () => {
  render(
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger>Trigger</TooltipTrigger>
        <TooltipContent>Tooltip body</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const trigger = screen.getByRole('button', { name: 'Trigger' });
  expect(screen.queryByText('Tooltip body')).not.toBeInTheDocument();

  await userEvent.hover(trigger);
  expect(await screen.findByText('Tooltip body')).toBeInTheDocument();
});

test('Sheet opens portalled content from its trigger', async () => {
  render(
    <Sheet>
      <SheetTrigger>Open sheet</SheetTrigger>
      <SheetContent>Sheet body</SheetContent>
    </Sheet>
  );

  expect(screen.queryByText('Sheet body')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open sheet' }));
  expect(await screen.findByText('Sheet body')).toBeInTheDocument();
});

test('AlertDialog opens portalled content from its trigger', async () => {
  render(
    <AlertDialog>
      <AlertDialogTrigger>Delete</AlertDialogTrigger>
      <AlertDialogContent>Are you sure?</AlertDialogContent>
    </AlertDialog>
  );

  expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('Are you sure?')).toBeInTheDocument();
});
