package com.sangofiora.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * Configuration to serve Eleventy-built static frontend from Spring Boot.
 * Seamlessly resolves root `/`, clean URLs (e.g. `/cart/` -> `/cart/index.html`),
 * and static assets from classpath:/static-frontend/.
 */
@Configuration
public class StaticResourceConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Dynamic uploaded product images from disk
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(
                        "file:uploads/",
                        "file:./uploads/",
                        "file:../uploads/",
                        "file:" + System.getProperty("java.io.tmpdir") + "/uploads/"
                );

        registry.addResourceHandler("/**")
                .addResourceLocations(
                        "classpath:/static-frontend/",
                        "file:static-frontend/",
                        "file:_site/",
                        "file:../_site/",
                        "classpath:/static/",
                        "file:uploads/"
                )
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource requested = location.createRelative(resourcePath);
                        if (requested.exists() && requested.isReadable()) {
                            return requested;
                        }
                        // Resolve clean directory URLs (e.g. /cart -> /cart/index.html)
                        Resource indexResource = location.createRelative(
                                resourcePath.endsWith("/") ? resourcePath + "index.html" : resourcePath + "/index.html"
                        );
                        if (indexResource.exists() && indexResource.isReadable()) {
                            return indexResource;
                        }
                        if (resourcePath.isEmpty() || resourcePath.equals("/")) {
                            return location.createRelative("index.html");
                        }
                        return null;
                    }
                });
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/").setViewName("forward:/index.html");
    }
}
