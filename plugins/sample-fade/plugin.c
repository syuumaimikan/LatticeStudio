#include "../../sdk/include/lattice_plugin.h"
#include <stdlib.h>

static const LatticePluginDescriptor DESC = {
    LATTICE_PLUGIN_ABI_VERSION,
    "com.lattice.sample.fade",
    "サンプル・フェード",
    "Lattice SDK",
    "1.0.0"
};

typedef struct FadeState { float opacity; } FadeState;

static int32_t process(LatticePlugin* plugin, const LatticeFrame* in, LatticeFrame* out) {
    if (!plugin || !in || !out || in->format != LATTICE_RGBA8 || out->format != LATTICE_RGBA8) return -1;
    FadeState* s = (FadeState*)plugin->userdata;
    const unsigned char* src = (const unsigned char*)in->pixels;
    unsigned char* dst = (unsigned char*)out->pixels;
    for (uint32_t y=0; y<in->height; ++y) {
        for (uint32_t x=0; x<in->width*4; ++x) {
            dst[y*out->stride_bytes+x] = (unsigned char)(src[y*in->stride_bytes+x] * s->opacity);
        }
    }
    return 0;
}
static void destroy(LatticePlugin* p) { if (p) { free(p->userdata); free(p); } }

#ifdef _WIN32
__declspec(dllexport)
#endif
const LatticePluginDescriptor* lattice_plugin_describe(void) { return &DESC; }

#ifdef _WIN32
__declspec(dllexport)
#endif
LatticePlugin* lattice_plugin_create(const LatticeHostApi* host) {
    (void)host;
    LatticePlugin* p = (LatticePlugin*)calloc(1, sizeof(LatticePlugin));
    FadeState* s = (FadeState*)calloc(1, sizeof(FadeState));
    if (!p || !s) return NULL;
    s->opacity = 0.75f;
    p->userdata = s;
    p->process_video = process;
    p->destroy = destroy;
    return p;
}
