# 🎨 Rein Brand & Style Guidelines

## 📖 1. Introduction

Welcome to the **Rein Brand Kit Guidelines**. This guide is designed for everyone working on Rein — contributors, collaborators, maintainers, designers, developers, and community members — who want to apply the Rein brand consistently across the application, documentation, presentations, social media, and open-source initiatives.

By following these guidelines, we ensure a unified, recognizable, and professional identity across Rein's desktop application, touchscreen interface, documentation, project website, and community materials.

### 🖥️ The Rein Brand Identity Formula

$$\text{Simple} + \text{Connected} + \text{Cross-Platform} + \text{Open Source} = \mathbf{Rein}$$

**Rein** is a cross-platform remote desktop interface built around the **KISS principle**. It started as a couch-friendly keyboard and trackpad replacement, allowing touchscreen devices to act as an interface for a desktop system through a locally served web interface.

The project is designed to go beyond a simple phone-to-PC remote control. Rein explores a common interface layer for remote computing, including desktop systems, cloud PCs, cloud gaming environments, and other platforms where the underlying infrastructure can remain separate from the user-facing interface. It can also leverage capabilities available on mobile devices, such as speech-to-text, to improve interaction with platforms where native support may be limited.

---

## 🔣 2. Logo System & Asset Usage

The Rein logo system represents the project's focus on remote interaction, connected devices, and simple human-computer interfaces. The visual identity should communicate a lightweight and modern interface rather than a conventional remote-desktop or screen-sharing product.

### Logo Variants

| Variant | Description | Recommended Usage |
| :--- | :--- | :--- |
| **Primary Logo** | Full Rein logo combining the project mark and wordmark. | Project landing pages, high-impact locations, official documents, release announcements. |
| **Secondary Logo** | Compact Rein wordmark optimized for horizontal layouts. | Application headers, navigation bars, documentation headers, and footers. |
| **Logomark** | Standalone Rein project mark. | Favicons, application icons, social media avatars, badges, and compact UI elements. |

### Color Consistency & Background Adaptation

Rein logo variants should be available for both **dark** and **light** backgrounds. The dark application interface is the primary visual environment, so the light logo variant should be preferred on dark surfaces.

> [!CAUTION]
> **Minimum Scaling Rule**: Never scale any logo or logomark below **24 px** in height or width. Always test for visual clarity and readability before publishing.

### 📥 Exporting Assets

To export Rein assets:

1. Select the required component or frame in the design source.
2. Preserve the original proportions of the logo.
3. Prefer **SVG** for scalable logos and vectors.
4. Use **PNG** for application icons, screenshots, and raster graphics.
5. Do not stretch, rotate, recolor, or otherwise modify official Rein assets.

---

## 🎨 3. Colour Scheme

Rein uses a dark, modern interface with a vibrant pink primary accent. Supporting purple, orange, and slate tones distinguish different classes of controls within the remote interface.

| Role | Color Name | Hex Code | RGB | ID |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Color** | Rein Pink | `#F66CC0` | `246, 108, 192` | `R-001` |
| **Secondary Color** | Rein Purple | `#B58AF0` | `181, 138, 240` | `R-002` |
| **Accent Color** | Rein Orange | `#FFB664` | `255, 182, 100` | `R-003` |
| **Dark Background** | Rein Background | `#1C1D27` | `28, 29, 39` | `R-004` |
| **Surface** | Rein Surface | `#252634` | `37, 38, 52` | `R-005` |
| **Neutral** | Rein Slate | `#45495E` | `69, 73, 94` | `R-006` |
| **Light Neutral** | Rein White | `#F5F5F5` | `245, 245, 245` | `R-007` |
| **Error** | Rein Error | `#FF4D5A` | `255, 77, 90` | `R-009` |

### Colour Roles

- **Rein Pink** is the primary interaction and highlight color.
- **Rein Purple** is used for modifiers and secondary keyboard controls.
- **Rein Orange** is used for media and playback controls.
- **Rein Slate** is used for standard keyboard and neutral controls.
- **Rein Background** is the primary application canvas.
- **Rein Surface** is used for panels, navigation, and elevated interface areas.
- **Rein Error** is reserved for connection failures and error states.

> [!TIP]
> Use the exact Hex codes above when creating Rein UI components, screenshots, documentation graphics, or promotional assets. Avoid introducing additional accent colors unless required for accessibility or status communication.

---

## 🔤 4. Typography

Rein uses **Inter** as its primary typeface across its digital interfaces, documentation, web application, and supporting project materials.

### Why Inter?

- **Performance & Scalability**: Inter is highly legible across small controls and high-resolution displays.
- **Consistency**: A single typeface provides a unified visual identity across platforms.
- **Interface Friendly**: Its proportions work well for compact keyboard buttons, navigation elements, and status information.
- **Open Source**: Inter is freely available and suitable for an open-source project.

### Type Hierarchy & Scale

| Style | Font Weight | Font Size | Best Used For |
| :--- | :--- | :--- | :--- |
| **Display** | Inter Black | 72 px | Hero headlines, major project announcements |
| **Heading 1** | Inter Bold | 48 px | Main page titles, major sections |
| **Heading 2** | Inter SemiBold | 36 px | Section subheadings |
| **Heading 3** | Inter Medium | 28 px | Component titles, cards |
| **Body** | Inter Regular | 18 px | Documentation and descriptive text |
| **Caption** | Inter Medium | 14 px | Status information, metadata, tags |
| **Button** | Inter SemiBold | 14 px | UI controls, keyboard labels, CTAs |

### UI Typography

- Keep interactive labels short and readable.
- Use medium or semibold weights for controls.
- Maintain consistent capitalization for keyboard and system keys.
- Avoid decorative typefaces in the application interface.
- Ensure disabled and secondary text remains readable.

---

## 🖼️ 5. Social Banners & Virtual Backdrops

### Social Media Banners

Rein social banners should communicate the project's purpose through its dark interface aesthetic, Rein logo, and primary pink accent.

Recommended themes include:

- *A cross-platform remote interface for your desktop*
- *A simple interface for connected devices*
- *Remote input through the devices you already have*
- *Open-source remote computing interface*
- *Rein development and release updates*

Primary banners should use the Rein dark background with restrained pink, purple, and orange accents.

### Virtual Meeting Backdrops

Rein virtual meeting backdrops should use a dark, minimal layout with sufficient empty space for the speaker while keeping the Rein identity visible.

Recommended elements:

- Rein logo
- `Rein`
- Short project description
- Optional AOSSIE and GSoC attribution where applicable
- Subtle interface, pointer, keyboard, or connection motifs

> [!TIP]
> Keep important logos and text away from the center of the backdrop so they are not obscured by the speaker during video calls.

---

## 🎴 6. Project & Contributor Cards

Rein contributor and project cards should follow the same dark visual identity as the application.

### Front Component (`card_front`)

Contains:

- Rein logo
- Project name
- Short project tagline
- Optional project repository or website

### Back Component (`card_back`)

May contain customizable fields for:

- `{Person Name}`
- `{Role}`
- `{GitHub}`
- `{LinkedIn}`
- `{Contact}`

Use Rein Pink for important headings and accents while keeping the overall design minimal.

---

## 📣 7. Social Media Post Templates

To maintain brand consistency across Rein announcements and community updates, two post templates are recommended.

### Template Type 1: High-Impact Announcements

- **Best Suited For**: Product releases, major milestones, architecture changes, new features, GSoC updates, and important project announcements.
- **Structure**: Main Title + Rein Logo + Feature/Release Highlight + Description + Screenshot/Graphic + Prominent CTA.

### Template Type 2: Informative & Community Content

- **Best Suited For**: Development updates, contributor spotlights, technical explanations, tutorials, project progress, and community announcements.
- **Structure**: Heading + Description + Showpiece Screenshot + Key Points + CTA + Date/Version + Topic Tags (`{TAG1} • {TAG2} • {TAG3}`).

Recommended tags may include:

`#Rein • #OpenSource • #RemoteComputing`

---

## 💡 8. Design Principles & Best Practices

When creating marketing assets, graphics, or UI components for Rein, follow these core principles:

1. **Clarity Over Clutter**: Keep layouts clean, spacious, and focused on the interaction.
2. **Simple by Design**: Rein follows the KISS principle; avoid unnecessary visual complexity.
3. **Connected Experience**: Visuals should communicate interaction between devices without making the phone the sole focus of the project.
4. **Consistent Colour Roles**: Pink, purple, orange, and slate should retain their established meanings.
5. **Dark First**: Rein's primary visual identity is based around its dark interface.
6. **Readable Controls**: Keyboard, trackpad, media, and status controls must remain clear at supported screen sizes.
7. **Respect Minimum Sizes**: Keep logos legible; never shrink logos below 24 px.
8. **Use Official Assets**: Do not modify logo colors, stretch proportions, or alter official Rein assets.

### UI Colour Roles

| Control Type | Recommended Color |
| :--- | :--- |
| Primary / Active | `#F66CC0` |
| Modifier | `#B58AF0` |
| Media / Playback | `#FFB664` |
| Standard Key | `#45495E` |
| Background | `#1C1D27` |
| Surface | `#252634` |
| Error / Disconnected | `#FF4D5A` |

---

## 📂 9. Repository Media Assets & Directory Index

Below is the directory index for media assets used by the Rein project.

### 📁 Root Media Directories

- 📂 **[Brand/Media Assets](./brand/Media-Assets/)** — Rein branding, banners, backdrops, and promotional assets.
- 📂 **[Project Icons](./public/app_icon/)** — Rein project logos and icons.

---

### 📱 A. Application Icons

**Directory Path**: `public/app_icon/`

| Asset Name | Format | Direct Link | Description |
| :--- | :--- | :--- | :--- |
| **Rein Favicon** | ICO | [`favicon.ico`](./public/app_icon/favicon.ico) | Browser and application favicon |
| **Rein Icon 192** | PNG | [`Icon192.png`](./public/app_icon/Icon192.png) | PWA/application icon |
| **Rein Icon 512** | PNG | [`Icon512.png`](./public/app_icon/Icon512.png) | High-resolution application icon |
| **Rein Icon Background** | PNG | [`IconBg.png`](./public/app_icon/IconBg.png) | Application icon background asset |

---


## 🤝 Summary Checklist for Contributors & Visitors

- [ ] Use the official Rein logo and logomark assets.
- [ ] Use **Rein Pink** (`#F66CC0`) as the primary accent color.
- [ ] Use **Rein Purple** (`#B58AF0`) for modifier and secondary controls.
- [ ] Use **Rein Orange** (`#FFB664`) for media and playback controls.
- [ ] Use **Rein Background** (`#1C1D27`) as the primary application background.
- [ ] Use **Rein Slate** (`#45495E`) for neutral controls.
- [ ] Use **Inter** as the default typeface.
- [ ] Keep logos at or above the 24 px minimum size.
- [ ] Preserve official logo proportions and colors.
- [ ] Keep the visual language simple and focused on interaction.
- [ ] Avoid positioning Rein solely as a phone-to-PC remote; represent its broader remote-computing direction.
- [ ] Use screenshots and visual assets that accurately represent the current Rein interface.
