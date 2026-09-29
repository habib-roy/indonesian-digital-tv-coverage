// Generate reference vectors from NTIA C++ ITM. Output: JSON lines.
// Build: g++ -O2 -std=c++17 -I. gen.cpp src/*.cpp -o gen
#include <cstdio>
#include <cmath>
#include <vector>
#include "itm.h"

static std::vector<double> profile(int kind, int np, double xi) {
    std::vector<double> p(np + 3);
    p[0] = np; p[1] = xi;
    for (int i = 0; i <= np; i++) {
        double t = (double)i / np, h;
        switch (kind) {
            case 0: h = 10; break;                                             // flat
            case 1: h = 20 + 300 * exp(-pow((t - 0.5) / 0.08, 2)); break;      // single hill
            case 2: h = 100 + 400 * fabs(sin(t * 9.0)) + 50 * sin(t * 37); break; // mountainous
            case 3: h = 5 + 40 * sin(t * 3.0); break;                          // gentle
            default: h = 800 - 700 * t + 900 * exp(-pow((t - 0.8) / 0.03, 2)); // ridge near rx
        }
        p[i + 2] = h;
    }
    return p;
}

int main() {
    struct Case { int kind, np; double xi, htx, hrx, f; int climate, pol, mdvar; double t, l, s; };
    Case cases[] = {
        {0, 100, 100, 150, 10, 500, 1, 0, 3, 50, 50, 50},
        {0, 300, 250, 250, 10, 600, 1, 0, 3, 50, 50, 90},
        {1, 200, 100, 100, 10, 500, 1, 0, 3, 50, 50, 50},
        {1, 200, 100, 100, 25, 500, 1, 0, 3, 90, 90, 50},
        {2, 500, 200, 250, 10, 700, 1, 0, 3, 50, 50, 50},
        {2, 500, 200, 250, 3, 474, 1, 0, 3, 50, 50, 50},
        {3, 150, 400, 300, 10, 578, 1, 0, 3, 50, 50, 50},
        {4, 400, 250, 200, 10, 522, 1, 0, 3, 50, 50, 50},
        {4, 400, 250, 200, 30, 522, 1, 0, 3, 50, 50, 50},
        {0, 600, 500, 300, 10, 690, 1, 0, 3, 50, 50, 50},
        {2, 247, 600, 200, 10, 500, 5, 1, 1, 50, 50, 50},
        {1, 100, 50, 30, 5, 3500, 5, 1, 1, 50, 50, 50},
    };
    printf("[\n");
    int n = sizeof(cases) / sizeof(cases[0]);
    for (int k = 0; k < n; k++) {
        Case c = cases[k];
        auto p = profile(c.kind, c.np, c.xi);
        double A; long w; IntermediateValues iv;
        int rtn = ITM_P2P_TLS_Ex(c.htx, c.hrx, p.data(), c.climate, 301, c.f, c.pol, 15, 0.005, c.mdvar, c.t, c.l, c.s, &A, &w, &iv);
        printf("{\"kind\":%d,\"np\":%d,\"xi\":%g,\"htx\":%g,\"hrx\":%g,\"f\":%g,\"climate\":%d,\"pol\":%d,\"mdvar\":%d,\"t\":%g,\"l\":%g,\"s\":%g,"
               "\"rtn\":%d,\"A\":%.6f,\"mode\":%d,\"warn\":%ld,\"dh\":%.6f}%s\n",
               c.kind, c.np, c.xi, c.htx, c.hrx, c.f, c.climate, c.pol, c.mdvar, c.t, c.l, c.s, rtn, A, iv.mode, w, iv.delta_h__meter, k < n - 1 ? "," : "");
    }
    printf("]\n");
}
