#ifndef LATTICE_PLUGIN_H
#define LATTICE_PLUGIN_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

#define LATTICE_PLUGIN_ABI_VERSION 1u

typedef struct LatticeHostApi LatticeHostApi;
typedef struct LatticePlugin LatticePlugin;

typedef enum LatticePixelFormat {
    LATTICE_RGBA8 = 1,
    LATTICE_RGBA16F = 2,
    LATTICE_RGBA32F = 3
} LatticePixelFormat;

typedef struct LatticeFrame {
    uint32_t width;
    uint32_t height;
    uint32_t stride_bytes;
    LatticePixelFormat format;
    void* pixels;
    uint64_t pts_ns;
} LatticeFrame;

typedef struct LatticePluginDescriptor {
    uint32_t abi_version;
    const char* id;
    const char* name_utf8;
    const char* vendor_utf8;
    const char* version_utf8;
} LatticePluginDescriptor;

typedef int32_t (*LatticeProcessVideoFn)(LatticePlugin*, const LatticeFrame*, LatticeFrame*);
typedef void (*LatticeDestroyFn)(LatticePlugin*);

struct LatticePlugin {
    void* userdata;
    LatticeProcessVideoFn process_video;
    LatticeDestroyFn destroy;
};

typedef const LatticePluginDescriptor* (*LatticeDescribeFn)(void);
typedef LatticePlugin* (*LatticeCreateFn)(const LatticeHostApi* host);

/* Required exports from a native plugin:
 * lattice_plugin_describe
 * lattice_plugin_create
 */

#ifdef __cplusplus
}
#endif
#endif
