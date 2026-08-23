import Foundation
import Libmpv
import OpenGL.GL
import OpenGL.GL3
import QuartzCore
import Synchronization

/// mpv's OpenGL render context drawn into a `CAOpenGLLayer`.
///
/// Layer-backed on purpose: sibling layers (danmaku, OSC) composite
/// correctly above it and live resize does not freeze the picture.
///
/// Lock order: `CGLLockContext` → render-context calls. The mpv update
/// callback never touches GL itself; it only schedules `display()`.
public final class MPVRenderLayer: CAOpenGLLayer, @unchecked Sendable {
    private let player: MPVPlayer
    nonisolated(unsafe) private var renderContext: OpaquePointer?
    nonisolated(unsafe) private var cglContext: CGLContextObj?
    private let renderQueue = DispatchQueue(label: "dev.milmil.mpv.render", qos: .userInteractive)
    /// render.h: only one `mpv_render_*` call at a time per core. CA may
    /// drive `canDraw`/`draw` from its own thread during live resize while
    /// the update callback schedules draws on `renderQueue`.
    private let renderLock = NSLock()
    private let tornDown = Atomic(false)
    private let forceRender = Atomic(false)

    public init(player: MPVPlayer) {
        self.player = player
        super.init()
        isOpaque = true
        isAsynchronous = false
        backgroundColor = CGColor(gray: 0, alpha: 1)
        autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
        contentsGravity = .resizeAspect
    }

    /// Presentation-layer copies (made whenever Core Animation animates the
    /// layer's frame) are inert: no render context, never create one, never
    /// draw. Only the model layer talks to mpv.
    override public init(layer: Any) {
        guard let other = layer as? MPVRenderLayer else {
            fatalError("MPVRenderLayer can only copy another MPVRenderLayer")
        }
        player = other.player
        renderContext = nil
        super.init(layer: layer)
        tornDown.store(true, ordering: .releasing)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    deinit {
        teardown()
    }

    // MARK: - Pixel format / context

    override public func copyCGLPixelFormat(forDisplayMask mask: UInt32) -> CGLPixelFormatObj {
        let attributes: [CGLPixelFormatAttribute] = [
            kCGLPFADoubleBuffer,
            kCGLPFAOpenGLProfile, CGLPixelFormatAttribute(kCGLOGLPVersion_3_2_Core.rawValue),
            kCGLPFAAccelerated,
            kCGLPFAAllowOfflineRenderers,
            kCGLPFABackingStore,
            CGLPixelFormatAttribute(0),
        ]
        var format: CGLPixelFormatObj?
        var count: GLint = 0
        CGLChoosePixelFormat(attributes, &format, &count)
        if let format { return format }
        return super.copyCGLPixelFormat(forDisplayMask: mask)
    }

    override public func copyCGLContext(forPixelFormat pixelFormat: CGLPixelFormatObj) -> CGLContextObj {
        let context = super.copyCGLContext(forPixelFormat: pixelFormat)
        var swapInterval: GLint = 1
        CGLSetParameter(context, kCGLCPSwapInterval, &swapInterval)
        CGLEnable(context, kCGLCEMPEngine)
        CGLSetCurrentContext(context)
        cglContext = context
        createRenderContextIfNeeded()
        return context
    }

    private func createRenderContextIfNeeded() {
        guard renderContext == nil, !tornDown.load(ordering: .acquiring), !player.isDestroyed else { return }
        var advanced: Int32 = 1
        var initParams = mpv_opengl_init_params(get_proc_address: { _, name in
            guard let name else { return nil }
            let symbol = CFStringCreateWithCString(kCFAllocatorDefault, name, CFStringBuiltInEncodings.ASCII.rawValue)
            let bundle = CFBundleGetBundleWithIdentifier("com.apple.opengl" as CFString)
            return CFBundleGetFunctionPointerForName(bundle, symbol)
        }, get_proc_address_ctx: nil)
        var context: OpaquePointer?
        let status: Int32 = MPV_RENDER_API_TYPE_OPENGL.withCString { apiType in
            withUnsafeMutablePointer(to: &initParams) { initPointer in
                withUnsafeMutablePointer(to: &advanced) { advancedPointer in
                    var params = [
                        mpv_render_param(type: MPV_RENDER_PARAM_API_TYPE, data: UnsafeMutableRawPointer(mutating: apiType)),
                        mpv_render_param(type: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, data: UnsafeMutableRawPointer(initPointer)),
                        mpv_render_param(type: MPV_RENDER_PARAM_ADVANCED_CONTROL, data: UnsafeMutableRawPointer(advancedPointer)),
                        mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil),
                    ]
                    return renderLock.withLock { mpv_render_context_create(&context, player.rawHandle, &params) }
                }
            }
        }
        guard status >= 0, let context else { return }
        renderContext = context
        mpv_render_context_set_update_callback(context, { context in
            guard let context else { return }
            Unmanaged<MPVRenderLayer>.fromOpaque(context).takeUnretainedValue().scheduleDraw()
        }, Unmanaged.passUnretained(self).toOpaque())
        player.setRenderTeardown { [weak self] in self?.teardown() }
    }

    // MARK: - Drawing

    /// Update callback → schedule a display on the render queue. The
    /// mandatory `mpv_render_context_update` happens in `canDraw`, where the
    /// GL context is current. In live resize CA already drives draws.
    private func scheduleDraw() {
        renderQueue.async { [weak self] in
            guard let self, !tornDown.load(ordering: .acquiring), renderContext != nil else { return }
            if isAsynchronous { return }
            forceRender.store(true, ordering: .releasing)
            display()
        }
    }

    override public func canDraw(
        inCGLContext ctx: CGLContextObj,
        pixelFormat pf: CGLPixelFormatObj,
        forLayerTime t: CFTimeInterval,
        displayTime ts: UnsafePointer<CVTimeStamp>?
    ) -> Bool {
        guard let renderContext, !tornDown.load(ordering: .acquiring) else { return false }
        CGLLockContext(ctx)
        CGLSetCurrentContext(ctx)
        defer { CGLUnlockContext(ctx) }
        let flags = renderLock.withLock { mpv_render_context_update(renderContext) }
        let hasFrame = flags & UInt64(MPV_RENDER_UPDATE_FRAME.rawValue) != 0
        let forced = forceRender.exchange(false, ordering: .acquiringAndReleasing)
        return hasFrame || forced
    }

    override public func draw(
        inCGLContext ctx: CGLContextObj,
        pixelFormat pf: CGLPixelFormatObj,
        forLayerTime t: CFTimeInterval,
        displayTime ts: UnsafePointer<CVTimeStamp>?
    ) {
        guard let renderContext, !tornDown.load(ordering: .acquiring) else { return }
        CGLLockContext(ctx)
        CGLSetCurrentContext(ctx)
        defer { CGLUnlockContext(ctx) }

        var boundFramebuffer: GLint = 0
        glGetIntegerv(GLenum(GL_DRAW_FRAMEBUFFER_BINDING), &boundFramebuffer)
        var viewport = [GLint](repeating: 0, count: 4)
        glGetIntegerv(GLenum(GL_VIEWPORT), &viewport)

        var fbo = mpv_opengl_fbo(fbo: boundFramebuffer, w: viewport[2], h: viewport[3], internal_format: 0)
        var flipY: Int32 = 1
        withUnsafeMutablePointer(to: &fbo) { fboPointer in
            withUnsafeMutablePointer(to: &flipY) { flipPointer in
                var params = [
                    mpv_render_param(type: MPV_RENDER_PARAM_OPENGL_FBO, data: UnsafeMutableRawPointer(fboPointer)),
                    mpv_render_param(type: MPV_RENDER_PARAM_FLIP_Y, data: UnsafeMutableRawPointer(flipPointer)),
                    mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil),
                ]
                renderLock.withLock {
                    _ = mpv_render_context_render(renderContext, &params)
                    glFlush()
                    mpv_render_context_report_swap(renderContext)
                }
            }
        }
    }

    // MARK: - Teardown

    /// Free the render context. Must run before `mpv_terminate_destroy`,
    /// with the GL context current like every other `mpv_render_*` call.
    func teardown() {
        let (exchanged, _) = tornDown.compareExchange(expected: false, desired: true, ordering: .acquiringAndReleasing)
        guard exchanged else { return }
        renderQueue.sync {
            guard let renderContext else { return }
            if let cglContext {
                CGLLockContext(cglContext)
                CGLSetCurrentContext(cglContext)
            }
            renderLock.withLock {
                mpv_render_context_set_update_callback(renderContext, nil, nil)
                mpv_render_context_free(renderContext)
            }
            if let cglContext { CGLUnlockContext(cglContext) }
            self.renderContext = nil
        }
        player.setRenderTeardown(nil)
    }
}
