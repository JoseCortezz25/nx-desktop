# Arquitectura y conexiones en Tauri

Investigación técnica para `nx-desktop`, basada en su código actual y en documentación primaria de Tauri 2, Rust, Serde y React. Consulta: 15 de octubre de 2026.

- [Guía de arquitectura](arquitectura-tauri.md): diagnóstico, alternativas, responsabilidades, IPC, contratos y DTO, seguridad, estado, convenciones, estructura y evolución incremental.
- [Referencias y límites de la investigación](arquitectura-tauri.md#fuentes-y-límites): documentación consultada y decisiones que todavía necesitan requisitos del producto.

La recomendación es comenzar con un **monolito modular**, organizar por funcionalidad y aplicar puertos y adaptadores en las integraciones que realmente lo necesiten. Es una propuesta para discutir e implementar gradualmente; esta carpeta no modifica la aplicación.
