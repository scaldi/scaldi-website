---
layout: normal-page
animateHeader: false
title: Learn Scaldi
---

## Overview

Scaldi is dependency injection library for Scala.
It's very lightweight (without any dependencies) and provides nice Scala DSL
for binding dependencies and injecting them.

If you would Like to get a quick overview of Scaldi, I would recommend you to look at [scaldi presentation slides]({{site.link.scaldi-presentation}}) or
look at the [main page]({{"/" | prepend: site.baseurl}}) which has some examples and [feature highlights]({{"/#feature-highlights" | prepend: site.baseurl}}).
For more hands-on approach, you can check out two example projects which you can play with:

* Scaldi Play Example ([GitHub]({{site.link.scaldi-play-example-github}}), [Blog]({{site.link.scaldi-play-example-blog}}), [Typesafe activator template]({{site.link.scaldi-play-example-template}}))
* Scaldi Akka Example ([GitHub]({{site.link.scaldi-akka-example-github}}), [Blog]({{site.link.scaldi-akka-example-blog}}), [Typesafe activator template]({{site.link.scaldi-akka-example-template}}))

Activator templates also contain tutorials which show Scaldi basics and also the ways you can integrate in play/akka application.

There are 3 most important traits that you need to know, in order to make dependency injection with Scaldi:

* [Injector](#injectors) - it's a container for the bindings, that you have defined in the module.
* [Module](#module) - gives you nice syntax to create bindings with `bind` and `binding`. `Module` also extends `Injector` trait and implicit `Injector` instance always available when you are defining your bindings
* [Injectable](#inject-bindings) - the only responsibility of this trait is to provide you with `inject` function (so it just provides nice syntax for injecting dependencies). It's important to understand, that it's the only the purpose of it. So it completely stateless and knows nothing about actual bindings you have defined in the module. In order to actually find and inject dependencies, `inject` function always takes an implicit parameter of type `Injector`

Next sections will describe each of these concepts in more detail.

## Injectors

`Injector` encapsulates the binding lookup mechanism, by defining following 2 methods:

{% highlight scala %}
trait Injector {
 def getBinding(identifiers: List[Identifier]): Option[Binding]
 def getBindings(identifiers: List[Identifier]): List[Binding]

 // ...
}
{% endhighlight %}


Out of the box Scaldi comes with several different types of `Injector`s. Most of the implementations contain the actual bindings and
provide some kind of DSL to define them (e.g. `Module`, `StaticModule`, `PropertyInjector`).
Other injectors have more specific role and serve as a wrapper for other injectors or as an integration point between Scaldi and other libraries.
`PropertyInjector` or `PlayConfigurationInjector` are examples of such `Injector`s.
`Injector` itself is used by the `inject` function (which takes an `Injector` as an implicit argument) to inject these bindings.

From the other hand injectors have also another property - every injector can be either **mutable** or **immutable**. These two types are differ in the
way [lifecycle](#injector-lifecycle) and [injector composition](#injector-composition) works. Next sections will describe it in more detail.

### Injector Lifecycle

Immutable injectors don't have any lifecycle associated with them.
Mutable injectors, from the other hand, have an initialization and shutdown lifecycle phases.
Initialization of an injector means that all non-lazy bindings are initialized.

Generally the initialization of `Injector` happens automatically as soon as you inject from it for the first time.
But you can also force it by calling `initNonLazy()` method:

{% highlight scala %}
val injector = new Module {
  bind [Server] as toNonLazy new Server
}

injector.initNonLazy()
{% endhighlight %}

In this example after the `initNonLazy` method is called, a new instance of `Server` class is created.

After injector is initialized, it becomes frozen, so `initNonLazy` (which is also used internally) is idempotent.

Injector lifecycle also has a shutdown phase during which all binding that defined `destroyWith` function would be destroyed.
All built-in mutable injectors are using `ShutdownHookLifecycleManager` which means that injector would be destroyed during the JVM
shutdown. But you can also force it by calling the `destroy` method:

{% highlight scala %}
val injector = new Module {
  bind [Server] to new Server destroyWith (_.terminate())
}

injector.destroy()
{% endhighlight %}

`destroy` method is also idempotent. Here is its signature:

{% highlight scala %}
def destroy(errorHandler: Throwable => Boolean = IgnoringErrorHandler)
{% endhighlight %}

As you can see, It also allows you to provide an error handler, that would be called if some exception happens during the
destruction of one of the bindings. The default `IgnoringErrorHandler` just prints the stack trace and continues the shutdown procedure.

If error handler returns `true`, then and exception will not stop the shutdown procedure. If it returns `false`, then shutdown procedure
would be stopped after the first exception is happened.

### Module

### DynamicModule

### StaticModule

### Property Injector

### Injector Composition

### Extending Injector

As you can see, `Injector` is pretty straightforward interface so just by implementing `getBinding` and `getBindings` methods you can create
your own injectors.

## Identifiers

## Define Bindings

### Lazy Binding

### Non-Lazy Binding

### Provider Binding

### Custom Bindings

### Binding Lifecycle

## Inject Bindings

### Default Values

## Conditions

## Testing

## Play Integration

## Akka Integration

