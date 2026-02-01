use tauri::{LogicalPosition, Manager, Position, Size};
use tauri_nspanel::{tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt};

// Define our panel class and event handler together
tauri_panel! {
    panel!(OpenUsagePanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })

    panel_event!(OpenUsagePanelEventHandler {
        window_did_resign_key(notification: &NSNotification) -> ()
    })
}

pub fn init(app_handle: &tauri::AppHandle) -> tauri::Result<()> {
    let window = app_handle.get_webview_window("main").unwrap();

    let panel = window.to_panel::<OpenUsagePanel>()?;

    // Configure panel behavior
    panel.set_level(PanelLevel::MainMenu.value() + 1);

    panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .stationary()
            .full_screen_auxiliary()
            .value(),
    );

    panel.set_style_mask(StyleMask::empty().nonactivating_panel().value());

    // Set up event handler to hide panel when it loses focus
    let event_handler = OpenUsagePanelEventHandler::new();

    let handle = app_handle.clone();
    event_handler.window_did_resign_key(move |_notification| {
        if let Ok(panel) = handle.get_webview_panel("main") {
            panel.hide();
        }
    });

    panel.set_event_handler(Some(event_handler.as_ref()));

    Ok(())
}

pub fn position_panel_at_tray_icon(
    app_handle: &tauri::AppHandle,
    icon_position: Position,
    icon_size: Size,
) {
    let window = app_handle.get_webview_window("main").unwrap();

    if let Some(monitor) = window.current_monitor().ok().flatten() {
        let scale_factor = monitor.scale_factor();

        let window_size = window.outer_size().unwrap();
        let window_width = window_size.width as f64 / scale_factor;

        // Extract physical position values
        let (icon_x, icon_width) = match (icon_position, icon_size) {
            (Position::Physical(pos), Size::Physical(size)) => (pos.x as f64, size.width as f64),
            (Position::Logical(pos), Size::Logical(size)) => {
                (pos.x * scale_factor, size.width * scale_factor)
            }
            (Position::Physical(pos), Size::Logical(size)) => {
                (pos.x as f64, size.width * scale_factor)
            }
            (Position::Logical(pos), Size::Physical(size)) => {
                (pos.x * scale_factor, size.width as f64)
            }
        };

        let icon_center_x = icon_x + (icon_width / 2.0);
        let panel_x = icon_center_x - (window_width / 2.0);

        // macOS menubar is typically 24-37pt depending on notch
        // Add extra padding to ensure panel appears below it
        let menubar_height = 37.0;
        let panel_y = menubar_height + 8.0;

        let _ = window.set_position(LogicalPosition::new(panel_x / scale_factor, panel_y));
    }
}
