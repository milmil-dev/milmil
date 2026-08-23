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
    private let renderQueue = DispatchQueue(label: "dev.milmil.mpv.render", qos: .userInteractive)
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
    /// layer's frame) must stay inert: they share no render context, so only
    /// the model layer ever calls into mpv.
    override public init(layer: Any) {
        guard let other = layer as? MPVRenderLayer else {
            fatalError("MPVRenderLayer can only copy another MPVRenderLayer")
        }
        player = other.player
        renderContext = nil
        super.init(layer: layer)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
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
        createRenderContextIfNeeded()
        return context
    }

    private func createRenderContextIfNeeded() {
        guard renderContext == nil, !tornDown.load(ordering: .acquiring) else { return }
        var advanced: Int32 = 1
        var initParams = mpv_opengl_init_params(get_proc_address: { _, name in
            guard let name else { return nil }
            let symbol = CFStringCreateWithCString(kCFAllocatorDefault, name, CFStringBuiltInEncodings.ASCII.rawValue)
            let bundle = CFBundleGetBundleWithIdentifier("com.apple.opengl" as CFString)
            return CFBundleGetFunctionPointerForName(bundle, symbol)
        }, get_proc_address_ctx: nil)
        let status: Int32 = withUnsafeMutablePointer(to: &initParams) { initPointer in
            withUnsafeMutablePointer(to: &advanced) { advancedPointer in
                let apiType = UnsafeMutableRawPointer(mutating: (MPV_RENDER_API_TYPE_OPENGL as NSString).utf8String)
                var params = [
                    mpv_render_param(type: MPV_RENDER_PARAM_API_TYPE, data: apiType),
                    mpv_render_param(type: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, data: UnsafeMutableRawPointer(initPointer)),
                    mpv_render_param(type: MPV_RENDER_PARAM_ADVANCED_CONTROL, data: UnsafeMutableRawPointer(advancedPointer)),
                    mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil),
                ]
                var context: OpaquePointer?
                let status = mpv_render_context_create(&context, player.rawHandle, &params)
                renderContext = context
                return status
            }
        }
        guard status >= 0, let renderContext else {
            self.renderContext = nil
            return
        }
        mpv_render_context_set_update_callback(renderContext, { context in
            guard let context else { return }
            Unmanaged<MPVRenderLayer>.fromOpaque(context).takeUnretainedValue().scheduleDraw()
        }, Unmanaged.passUnretained(self).toOpaque())
        player.setRenderTeardown { [weak self] in self?.teardown() }
    }

    // MARK: - Drawing

    private func scheduleDraw() {
        renderQueue.async { [self] in
            guard !tornDown.load(ordering: .acquiring), let renderContext else { return }
            let flags = mpv_render_context_update(renderContext)
            guard flags & UInt64(MPV_RENDER_UPDATE_FRAME.rawValue) != 0 else { return }
            if isAsynchronous {
                // CA is already driving draws at display rate (live resize).
                return
            }
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
        guard renderContext != nil, !tornDown.load(ordering: .acquiring) else { return false }
        if forceRender.exchange(false, ordering: .acquiringAndReleasing) { return true }
        if isAsynchronous, let renderContext {
            return mpv_render_context_update(renderContext) & UInt64(MPV_RENDER_UPDATE_FRAME.rawValue) != 0
        }
        return true
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
                _ = mpv_render_context_render(renderContext, &params)
            }
        }
        glFlush()
        mpv_render_context_report_swap(renderContext)
    }

    // MARK: - Teardown

    /// Free the render context. Must run before `mpv_terminate_destroy`.
    func teardown() {
        let (exchanged, _) = tornDown.compareExchange(expected: false, desired: true, ordering: .acquiringAndReleasing)
        guard exchanged else { return }
        renderQueue.sync {
            guard let renderContext else { return }
            mpv_render_context_set_update_callback(renderContext, nil, nil)
            mpv_render_context_free(renderContext)
            self.renderContext = nil
        }
    }
}
