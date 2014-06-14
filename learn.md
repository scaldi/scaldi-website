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
def destroy(errorHandler: Throwable => Boolean = IgnoringErrorHandler): Unit
{% endhighlight %}

As you can see, it also allows you to provide an error handler that would be called if some exception happens during the
destruction of one of the bindings. The default `IgnoringErrorHandler` just prints the stack trace and continues the shutdown procedure.

If error handler returns `true`, then and exception will not stop the shutdown procedure. If it returns `false`, then shutdown procedure
would be stopped after the first exception is happened.

### Module

`Module` is the most common injector that you can use in most cases. It is mutable injector so it can have a lifecycle and it also provides
nice DSL for the bindings. Here is an example of it's usage:

{% highlight scala %}
val injector = new Module {
  binding identifiedBy 'host and 'google to "www.google.com"
  binding identifiedBy 'host and 'yahoo to "www.yahoo.com"
  binding identifiedBy 'host and 'github to "www.github.com"

  binding identifiedBy 'server to HttpServer("localhost", 80)
  binding identifiedBy 'server to None
  binding identifiedBy 'server to HttpServer("test", 8080)

  binding identifiedBy 'intAdder to ((a: Int, b: Int) => a + b)
  binding identifiedBy 'stringAdder to ((s1: String, s2: String) => s1 + ", " + s2)

  bind [Int] identifiedBy 'httpPort to 8081

  bind [Server] identifiedBy 'http to
    HttpServer(inject [String] ('httpHost), inject [Int] ('httpPort))

  binding identifiedBy 'database and "local" to MysqlDatabase("my_app")
}
{% endhighlight %}

### DynamicModule

`DynamicModule` is vary similar to the [Module](#module) so it is also a mutable injector which provides the binding DSL. The only
difference is that it allows you bind dependencies in a function and not in the body of the subclass. Here is an example if it's usage:

{% highlight scala %}
implicit val injector = DynamicModule({ module =>
 module.bind [Int] identifiedBy 'httpPort to 8081
 module.bind [Server] identifiedBy 'http to
   HttpServer(inject [String] ('httpHost), inject [Int] ('httpPort))
 module.binding identifiedBy 'database and "local" to MysqlDatabase("my_app")
})
{% endhighlight %}

### StaticModule

`StaticModule` is an immutable injector that allows you to define binding as `def`s, `val`s and `lazy val`s in the body of the subclass:

{% highlight scala %}
val module = new StaticModule {
  lazy val server = new TcpServer
  lazy val otherServer = HttpServer(inject [String] ("httpHost"), inject [Int] ('httpPort))

  def tcpHost = "tcp-test"
  def tcpPort = 1234

  val httpHost = "localhost"
  val httpPort = 4321
}
{% endhighlight %}

The resulting bindings have 2 [identifiers](#identifiers):

* String identifier which is the name if the class member (e.g. `tcpHost`, `otherServer`, etc.)
* Class identifier which is return type of the `def` or the type of the `val`

In some cases this can be pretty restrictive, because your bindings can't have have more identifiers or conditions associated with them.
To prvide more flexibility Scaldi also allows you to return a `BindingProvider` from the member of the class instead of a regular type.
Here is how it looks like:

{% highlight scala %}
trait BindingProvider {
  def getBinding(name: String, tpe: Type): Binding
}
{% endhighlight %}

So `BindingProvider` gives you the complete control over the resulting binding.

### Property Injector

All property injectors are immutable and allow you to add binding from a property file or `Properties` class. Here is a small example how
you can use it:

{% highlight scala %}
// define some properties
val props = new  Properties()

props.setProperty("host", "test-prop")
props.setProperty("port", "54321")

// main application module
class AppModule extends Module {
  bind [Server] to HttpServer(inject [String] ('host), inject [Int] ('port))

  binding identifiedBy 'host to "localhost"
  binding identifiedBy 'port to 80
}

implicit val injector = PropertiesInjector(props) :: new AppModule

Injectable.inject[Server] should equal (HttpServer("test-prop", 54321))
{% endhighlight %}

All properties are available as bindings and each property has only one string identifier and it's the name of the property.
The type of the binding is defined on the inject side. You can inject following types:

* Int
* Float
* Double
* Boolean
* File
* String

In addition to `PropertiesInjector` you can also use `SystemPropertiesInjector` which, as you can imagine,
allows you to inject system properties. In fact both these classes extend `RawInjector`, which allows you
easily write similar injectors. For example this is the complete implementation of `PlayConfigurationInjector`
that provides all properties from play application configuration as a bindings:

{% highlight scala %}
class PlayConfigurationInjector(app: => Application) extends RawInjector {
  def getRawValue(name: String) = app.configuration.getString(name)
}
{% endhighlight %}

### Injector Composition

Scaldi also allows you to compose injectors together with `::` or `++` operators:

{% highlight scala %}
val mainInjector = new ApplicationModule :: new DatabaseModule

// or the equivalent

val mainInjector = new ApplicationModule ++ new DatabaseModule
{% endhighlight %}

Now when you `inject` bindings from the `mainInjector` it will lookup bindings from both injectors:
`ApplicationModule` and `DatabaseModule`. **The order of the injectors is important.** So the binding lookup would
happen from left to right. This means if `ApplicationModule` and `DatabaseModule` both have a binding with the same identifiers, than one from
the `ApplicationModule` wins and would be injected. You can find more information about binding
overrides [in the correspondent section](#binding-overrides).

There is also another important aspect of the injector composition, namely mutability level. You can compose
mutable and immutable injectors together and the result you be either `ImmutableInjectorAggregation` or `MutableInjectorAggregation`
which is an injector on it's own, so it can be composed further with other injectors. This mean that if you are composing
more than 2 injectors together, than they will form a tree, in which internal nodes are the the injector aggregations and
the leafs are the concrete injectors you are composing.

The composition is implemented with the type class `CanCompose`:

{% highlight scala %}
trait CanCompose[-A, -B, +R] {
  def compose(cmp1: A, cmp2: B): R
}
{% endhighlight %}

where `A` and `B` are the injectors on the left and right side of the composition. `R` is the type of the resulting injector, that combines
`A` and `B` in some way. Scaldi defines following rules for the injector composition (which you can customise by providing your own implicit instances of
the `CanCompose` type class):

* immutable injector + immutable injector = immutable injector aggregation
* mutable injector + immutable injector = mutable injector aggregation
* immutable injector + mutable injector = mutable injector aggregation

There is also another special type of the injector which is called `NilInjector`. It does not contain any bindings and
completely ignored during the composition. It can be useful if you want to conditionally compose some injector in one expression:

{% highlight scala %}
val inj = new AModule :: (if (someCondition) new BModule else NilInjector) :: new CModule
{% endhighlight %}

Mutability in terms of injector composition means 2 things. First it means, that when aggregation is initialized or destroyed, then
it will also recursively initialize or destroy all of it's mutable children. So in this example:

{% highlight scala %}
val injector = new SomeImmutableInjector :: new SomeMutableInjector

injector.initNonLazy()
injector.destroy()
{% endhighlight %}

only `SomeMutableInjector` would be influenced. `SomeImmutableInjector` is not touched by the aggregation when `injector.initNonLazy()` or
`injector.destroy()` is called.

Mutability also changes the way binding lookup is done within a module. Every concrete injector like `Module` or `StaticModule`
has an implicit injector instance in scope when you are defining the bindings. That's because you are able to inject binding within
a `Module`, for example, or you are able to create new instances of classes that take and implicit instance of `Injector` as a constructor
argument. But this implicit injector instance is different in mutable and immutable injectors. It would easier to explain it small example:

{% highlight scala %}
val dbModule = new Module {
  bind [Database] to new Riak(inject [String] ('host))
}

val configModule = new Module {
 bind [String] identifiedBy 'host to "localhost"
 bind [AppConfig] to new AppConfig(inject [Database])
}

val appModule = dbModule :: configModule
{% endhighlight %}

both `dbModule` and `configModule` are mutable injector, so the implicit injector reference, that they provide within them,
is referencing the final injector composition (`appModule` in this case) and not themselves. That's the reason why you are able
to `inject [String] ('host)` within the `dbModule` and `inject [Database]` within the `configModule`. The reference to the final
composition is propagated during the initialization phase.

Immutable injectors on the other hand do not have any kind of initialisation phase, so the implicit injector, that they provide,
always references themselves. They only can contribute it's own bindings to the final composition, but they are unable to
consume bindings from it. So if `configModule` would have been an immutable injector, then it would fail because of the `inject [Database]`.

### Implementing Scoped Bindings



### Extending Injector

As you can see, `Injector` is pretty straightforward interface so just by implementing `getBinding` and `getBindings` methods you can create
your own injectors.

## Identifiers

## Define Bindings

### Binding Overrides

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

