import { render } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';

import { VideoPlayer } from './VideoPlayer';

// @videojs/react is on a fast-moving v10 beta and this player is the core of
// the app, so pin down the wiring a beta bump is most likely to break: the
// createPlayer() provider, the skin container, and the control bar. A missing
// or renamed provider export makes React throw "Element type is invalid" here.

test('VideoPlayer mounts the player provider and renders the skin', () => {
  const { container } = render(
    <VideoPlayer src="https://example.com/stream.m3u8" type="application/x-mpegURL" />
  );

  expect(container.querySelector('.media-default-skin')).toBeTruthy();
  expect(container.querySelector('.media-controls')).toBeTruthy();
});

test('VideoPlayer renders extra control-bar content', () => {
  const { getByTestId } = render(
    <VideoPlayer
      src="https://example.com/stream.m3u8"
      controlBarExtra={<span data-testid="extra-control">extra</span>}
    />
  );

  expect(getByTestId('extra-control')).toBeInTheDocument();
});
