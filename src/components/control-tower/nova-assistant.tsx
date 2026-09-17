
export function NOVAAvatar({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`nova-avatar ${className}`} style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/nova-robot.png"
        alt="NOVA Assistant"
        width={size}
        height={size}
        style={{ objectFit: "contain", width: "100%", height: "100%" }}
      />
    </div>
  );
}

export function NovaSidebarAssistant() {
  return (
    <div className="nova-sidebar-assistant">
      <div className="nova-sidebar-robot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nova-robot-sidebar.png"
          alt="NOVA"
          width={64}
          height={64}
          style={{ objectFit: "contain" }}
        />
      </div>
      <div className="nova-sidebar-bubble">
        <p><strong>Hi, I&apos;m NOVA!</strong></p>
        <p>Keeping your workshop flowing smoothly.</p>
        <span className="nova-status-tag"><span className="status-dot" />System Online</span>
      </div>
    </div>
  );
}
