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

Moy may be familiar with the concept of **scope** from other DI libraries out there.
The scope of binding defines the context and the lifespan of the binding. So if we are talking about the web application,
then you can define bindings in scope of the request or a session, for instance.

Scaldi does not provide any support for the scopes out of the box. More often than not, most useful scopes are tightly coupled
with some other library that you are working with in you project, like web framework. So scaldi stays unopinionated in this
respect, which allows you to use Scaldi with any library or framework you wish.

From the other hand, you can easily achieve very similar behaviour just by using abstractions that Scaldi provides out of the box.
Here I would like to show you a small example of how you can define a scoped bindings and isolate them from the rest of the bindings
by creating some kind of a sandbox for them.

In order to be able to do this, we need to define the sandbox itself first:

{% highlight scala %}
class ImmutableWrapper(delegate: Injector) extends Injector with ImmutableInjector {
  def getBinding(identifiers: List[Identifier]): Option[Binding] =
    delegate.getBinding(identifiers)

  def getBindings(identifiers: List[Identifier]): List[Binding] =
    delegate.getBindings(identifiers)
}
{% endhighlight %}

Here we define a very simple implementation of an injector, that just delegates the binding lookup to some other injector
(`delegate` in this case). The important thing to notice here is that `ImmutableWrapper` is an `ImmutableInjector`. This means that it
will guard `delegate` from any lifecycle of the parent composition, if it gets composed with another injector. It also will know nothing about
the final composition, because it is immutable, so it only able to contribute it's bindings to the composition, but not aware of it at all.

Now lets use it:

{% highlight scala %}
class AppModule extends Module {
  bind [Database] to new Riak(inject [String] ('host), 1234)

  binding identifiedBy 'host to "localhost"
}

class UserScopedModule(user: User) extends Module {
  binding to user

  bind [ProfileService] to new DbProfileService
}

val mainModule = new AppModule

def processUser(user: User) = {
  implicit val userScopedModule = new UserScopedModule(user) :: new ImmutableWrapper(mainModule)

  val profileService = inject [ProfileService]

  profileService.deactivateProfile()

  userScopedModule.destroy()
}

processUser(User("John", "Doe"))
processUser(User("Some", "User"))
processUser(User("Another", "One"))
{% endhighlight %}

`DbProfileService` looks like this:

{% highlight scala %}
case class DbProfileService(implicit inj: Injector) extends ProfileService with Injectable  {
  val db = inject [Database]
  val user = inject [User]

  def deactivateProfile() = {
    println(s"deactivating $user")
  }
}
{% endhighlight %}

Even after you destroyed `userScopedModule`, `mainModule` still remains intact, even though both of these injectors are mutable,
because we isolated it from the `userScopedModule` with the `ImmutableWrapper`.

So as you can see, core Scaldi abstractions are flexible enough to even express concepts that are normally built-in in other libraries.

### Extending Injector

`Injector` is pretty straightforward interface to implement (we already saw several examples of it above):

{% highlight scala %}
trait Injector {
 def getBinding(identifiers: List[Identifier]): Option[Binding]
 def getBindings(identifiers: List[Identifier]): List[Binding]

 // ...
}
{% endhighlight %}

so just by implementing `getBinding` and `getBindings` methods you can create your own injectors.
You can also reuse some parts of Scaldi implementation. Here is an example of new mutable injector, which can be used
in the injector composition (which on itself means that it would be properly initialized/destroyed and that it also aware of the
final injector composition):

{% highlight scala %}
class ControllerInjector extends MutableInjectorUser
                            with InjectorWithLifecycle[ControllerInjector]
                            with ShutdownHookLifecycleManager {

  def getBindingInternal(identifiers: List[Identifier]) = {
    // your binding lookup logic
  }

  def getBindingsInternal(identifiers: List[Identifier]) = {
    // your binding lookup logic
  }

  protected def init(lifecycleManager: LifecycleManager) = {
    // your initialization logic
  }
}
{% endhighlight %}

Hre is the list of some of the traits that you can mix-in in your own `Injector` implementations:

* `MutableInjectorUser` - contains implicit reference to `injector` - the final injector composition which is used by `inject`.
  Injector aggregation will set it during the initialization phase
* `InjectorWithLifecycle` - for the injectors that have lifecycle and can be initialized/destroyed
* `LifecycleManager` - all mutable injectors need to be a `LifecycleManager`
  * `ShutdownHookLifecycleManager` - implementation of the `LifecycleManager` that calls all of it's destroy callbacks during the
    JVM shutdown. The implementation is idempotent and thread-safe.
* `Injectable` - provides [injection DSL](#inject-bindings) in body of the subclasses (similar to what `Module` allows you to do, if you extend it)
* `WordBinder` - provides [binding DSL](#define-bindings) in body of the subclasses (similar to what `Module` allows you to do, if you extend it)
* `ReflectionBinder` - gathers all `val`s, `def`s and `lazy val`s in the body of the subclasses and exposes them as a bindings (similar to what `StaticModule` allows you to do, if you extend it)

## Identifiers

The list of `Identifier`s is used to identify the binding. Unlike many other DI libraries, Scaldi does not hardcode the notion of the
identifier, but rather provides very simple interface and uses it to lookup the bindings:

{% highlight scala %}
trait Identifier {
  def sameAs(other: Identifier): Boolean
}
{% endhighlight %}

Out of the box Scaldi comes with following identifiers:

* `TypeTagIdentifier`
* `StringIdentifier`

These are the most common one - normally you associate the binding with some type and optionally with the set string identifiers.
In this example:

{% highlight scala %}
bind [Server] identifiedBy 'real and 'http to
  HttpServer(inject [String] ('httpHost))
{% endhighlight %}

As you can see, `Symbol`s are also treated as string identifiers. In this case biding gets these 3 identifiers:

* `TypeTagIdentifier(typeOf[Server])`
* `StringIdentifier("real")`
* `StringIdentifier("server")`

and the `inject` will lookup binding with *at least* following identifiers:

* `TypeTagIdentifier(typeOf[String])`
* `StringIdentifier("httpHost")`

Scaldi also provides a type class in order to treat an existing classes like `String` or `Symbol` as identifiers:

{% highlight scala %}
trait CanBeIdentifier[T] {
  def toIdentifier(target: T): Identifier
}
{% endhighlight %}

So if you want some existing class to be treated as an identifier, then you need to provide an implicit instance of `CanBeIdentifier` in scope.

## Define Bindings

Scaldi provides a biding DSL which you can you can use inside of the `Module`. Here is an example of how you can bind some object:

{% highlight scala %}
class AppModule extends Module {
  binding identifiedBy 'host and 'google to "www.google.com"

  bind [Server] identifiedBy 'http when inProdMode to new HttpServer destroyWith (_.shutdown())
}
{% endhighlight %}

you can start to define binding with either `bind` or `binding` word. `bind` accepts one type parameter, which would be the
`TypeTagIdentifier` of the binding or in other words it is the type of the bindings. `binding` syntax assumes that the type of the binding
is the same to the bound object, so it does not take any type parameters.

You can provide addition identifiers for the binding with `identifiedBy` word or `as` and if you have more than one additional identifier, then you
can use `and`:

{% highlight scala %}
bind [Server] identifiedBy 'http and 'server to new HttpServer

// or equivalent

bind [Server] as 'http and 'server to new HttpServer
{% endhighlight %}

After this you can define a condition (only one, but you can combine several conditions with `or` or `and`) with `when` word:

{% highlight scala %}
bind [Server] when (inDevMode or inTestMode) to new HttpServer
{% endhighlight %}

you can find more information about the conditions in the [Conditions section](#conditions).

The actual value of the binding is bound with the different flavours of `to` word (if you prefer, you can use `in*` instead of `to*` syntax):

* `to` - defines a lazy binding
* `toNonLazy` - defines a non-lazy binding
* `toProvider` - defines a provider binding

all types of the bindings are described in more detail in the next sections.

Finally you can specify a lifecycle callbacks with `initWith`/`destroyWith` words which take a function `T => Unit` as an argument, where
`T` is the type of the binding:

{% highlight scala %}
bind [Server] to new HttpServer initWith (_.init()) destroyWith (_.shutdown())
{% endhighlight %}

### Binding Overrides

You can define several bindings for the same set of identifiers. During the binding lookup (when you injecting them) the latest
one would be used. You can also un-define the binding by defining the new binding to `None`. Here is an example:

{% highlight scala %}
bind [Server] to new HttpServer(port = 1234)
bind [Server] to None
bind [Server] to new HttpServer(port = 8080)
{% endhighlight %}

IN this example when you inject the `Server`:

{% highlight scala %}
val server = inject [Server]
{% endhighlight %}

then the `server` instance will have port 8080 (and only one instance of `HttpServer` would be created).

### Lazy Binding

Lazy bindings are defined with the `to` word:

{% highlight scala %}
bind [UserService] to new UserService
{% endhighlight %}

The instance would be created **only once** as soon as as the binding is injected for the first time. All consequent
injects inject the instance that was created first time.

### Non-Lazy Binding

Non-lazy bindings are defined with the `toNonLazy` word:

{% highlight scala %}
bind [Database] toNonLazy new Riak
{% endhighlight %}

The instance would be created **only once**, but it would be created as soon as injector (in which it is defined) is initialized.
All injects get the save instance of the binding.

### Provider Binding

Provider bindings are defined with the `toProvider` word:

{% highlight scala %}
bind [Client] toProvider new HttpClient
{% endhighlight %}

A new instance is created **each time** the binding is injected. This means that each time you inject the binging, you get the new instance.

### Binding Lifecycle

The lifecycle of the binding consist of the init and destroy phases.

You can define the `T => Unit` initialization function with `initWith` word:

{% highlight scala %}
bind [Server] to new HttpServer initWith (_.init())
{% endhighlight %}

the same for the function that destroys the object. You can use `destroyWith` word:

{% highlight scala %}
bind [Server] to new HttpServer destroyWith (_.shutdown())
{% endhighlight %}

The bindings are destroyed together with the `Injector` in which they are defined. The initialization depends on
the binding type, but in general it is initialized as soon as new instance of binding is created and before it is injected.

### Custom Bindings

When you are creating you own `Injector`s, you also have opportunity to create your own types of bindings by implementing one of two traits:

* `Binding` - meant to be maintained by immutable injectors
* `BindingWithLifecycle` - meant to be maintained by mutable injectors

Alternatively you can use bindings that come out of the box:

* `LazyBinding`
* `NonLazyBinding`
* `ProviderBinding`

## Inject Bindings

Scaldi provides nice DSL for the binding injection. In order to make it available, you need to either import from `Injectable`:

{% highlight scala %}
import Injectable._
{% endhighlight %}

or extend it in your class:

{% highlight scala %}
class UserService(implicit inj: Injector) extends Injectable {
  // ...
}
{% endhighlight %}

Here is an example of how you can inject a binding:

{% highlight scala %}
val db = inject [Database] (identified by 'remote is by default defaultDb)
{% endhighlight %}

All forms of inject expect and implicit instance of `Injector` to be in scope.
If you are injecting in the module definition, then it already provides one for you. If you
are injecting in you own classes, then the best approach you be to provide the implicit injector
instance as a constructor argument, as shown in the example above.

### Inject Single Binding

To inject a single binding you need to use `inject` method. It tales a type parameter, which is the type of the binding and
would treated as a `TypeTagIdentifier`. You can also provide additional biding identifiers using `identified by` and separate
identifiers with `and` word:

{% highlight scala %}
val userDb = inject [Database] (identified by 'remote and 'users)
{% endhighlight %}

you can also skip `identified by ` part and just write:

{% highlight scala %}
val userDb = inject [Database] ('remote and 'users)
{% endhighlight %}

{% include ext.html type="info" title="Explicit binding type" %}
Please make sure to always provide the type of the binding explicitly (except when you are providing the default value).
Unfortunately compiler can't correctly infer it in most cases.
But don't worry - the application will not compile if you forgot to specify the type you want to inject.
{% include cend.html %}

### Inject Provider Function

In addition to `inject`, which injects the concrete instance of the binding, you can use `injectProvider` which will
inject the function of type `() => T`, where `T`
is the type of the binding. It can be useful if the binding itself is defined with `toProvider`, so that each time you use it, you will
get the new instance. Other use case would be conditional bindings - if you have defined a binding with the same identifiers but with different
conditions, then this function can return different instances depending on the condition you've defined.

Here is an example of how you can use it:

{% highlight scala %}
class UserService(implicit inj: Injector) extends Injectable {
  val metrics = injectProvider [MetricsReporter]

  def loginUser(user: User) = {
    metrics().incrementCounter("user.login")

    // ...
  }
}
{% endhighlight %}

### Inject Several Bindings

In some cases you need to inject all bindings that match the identifiers. You can do this by using the `injectAllOfType`

{% highlight scala %}
val databases: List[Database] = injectAllOfType [Database]
{% endhighlight %}

You can also provide additional identifiers as an vararg argument:

{% highlight scala %}
val databases: List[Database] = injectAllOfType [Database] ('user, 'cache)
{% endhighlight %}

If you don't want to specify the `TypeTagIdentifier`, then you can use `injectAll`, which just takes the list of identifiers as an argument
and has no type parameters.

### Default Values

You can also specify the default value for the binding. It would be used, if the biding is not found in the `Injector`.
Here is an example of it:

{% highlight scala %}
val db = inject [Database] (by default new Riak)
{% endhighlight %}

if you already providing some additional identifiers and would like add the default value, then you can use `is` or `and` word:

{% highlight scala %}
val db = inject [Database] (identified by 'remote is by default default new Riak)

// or equivalent

val db = inject [Database] (identified by 'remote and by default new Riak)
{% endhighlight %}

{% include ext.html type="info" title="Use defaults with caution" %}
Event though default values can be useful in some circumstances, I would recommend you to avoid them in
most cases. Scaldi provides a lot of tools to help you in this respect. For example you can extract all of your defaults in
one/several modules and then compose them with the rest of the application modules. By doing this you
will make sure, that defaults are defined only once.
{% include cend.html %}

### Constructor Injection vs Implicit Injector

Generally you can take two approaches when it comes to the injection of dependencies.

You define all dependencies of some class as a constructor arguments. In this case you need to provide all of
them when you are instantiating the class. Here is how you can do it in Scaldi:

{% highlight scala %}
class UserService(repo: UserRepository, metrics: MetricsReporter) {
  // ...
}

class AppModule extends Module {
  binding to new UserService(
    repo = inject [UserRepository],
    metrics = inject [MetricsReporter]
  )
}
{% endhighlight %}

Scaldi do not provide any mechanism to "magically" inject `repo` and `metrics` when `UserService` is instantiated.
Generally it can be a good idea to provide some kind of safe mechanism for this, so maybe in future Scaldi will get a macro
that will automatically provide the constructor arguments for you.

Another approach would be to bring the implicit injector instance in scope of class and do the injection there:

{% highlight scala %}
class UserService(implicit inj: Injector) extends Injectable {
  val repo = inject [UserRepository]
  val metrics = inject [MetricsReporter]

  // ...
}

class AppModule extends Module {
  binding to new UserService
}
{% endhighlight %}

This approach definitely removes some of the boilerplate, but also couples UserService with Scaldi.

I think in most cases it's the matter of your personal/your teams preference which approach you take. Each of them has a trade-off
to make, but in many cases the constructor injection approach is the most clean one, even though it requires a little bit more
ceremony, so I you recommend you to use it. But every application is different, so you need to decide it for yourself,
taking you team and the nature of the project into the consideration.

## Conditions

When you are defining bindings, you can also specify a condition with `when` word:

{% highlight scala %}
bind [Database] when inProdMode to new Riak
bind [Database] when (inDevMode or inTestMode) to new InMemoryDatabase
{% endhighlight %}

This gives you a lot of flexibility in the ways you can define the bindings.

Out of the box Scaldi comes with `SysPropCondition` which can enable/disable binding based on the system property:

{% highlight scala %}
val inDevMode = SysPropCondition(name = "mode", value = "dev")
val inProdMode = !inDevMode
{% endhighlight %}

But you can easily convert any predicate in condition like this:

{% highlight scala %}
val inDevMode = Condition(System.getProperty("devMode") != null)
{% endhighlight %}

As you already saw, conditions can be composed with `or` and `and` operators and they also support unary `!` for negation.

Here is an example of how `inDevMode` is implemented in the play support:

{% highlight scala %}
def inDevMode(implicit inj: Injector) = {
  val mode = inject [Mode] ('playMode)

  Condition(mode == Dev)
}
{% endhighlight %}

As you can see, you can even use injected dependencies in your condition.

Conditions is a very powerful tool, which can be used in many interesting ways. But please use it with caution,
and don't introduce too many conditions in your application. Also try to keep them intuitive and simple.

## Testing

Even though Scaldi does not provide explicit testing support or test-kit of any description, the testability was kept in
mind from the ground up. If you read this documentation from the beginning, you probably already have an idea how you can
test a application that uses Scaldi to do the dependency injection.

The main feature that will help you with testing is the binding overrides. You can can override any binding so that the original
binding will never be touched/instantiated and the overriding binding would be used instead.

{% highlight scala %}
// production code

class AppModule extends Module {
  bind [Database] to new Riak
}

// testing code

def mocksModule = new Module {
  bind [Database] to new InMemoryDb
}

implicit val testModule = mocksModule :: new AppModule

val db = inject [Database]
{% endhighlight %}

Biding lookup happen from left to right, so the binding for the `mocksModule` would be first looked-up in `mocksModule`, so the
`db` gets an instance of `InMemoryDb` and `Riak` would not be instantiated at all.

{% include ext.html type="info" title="Don't reuse already initialised injectors" %}
As you can see in this example, I used `def` to define `mocksModule` and I also created a fresh instance of the `AppModule`. This is
important, because they both are mutable so they have a lifecycle associated with them. If I will make and `object` from the `AppModule`
(instead of `class`), then it will not work correctly if you have more than one test that creates `testModule` because the injector
aggregation will try to initialize it once aging when `Database` is injected, which is wrong. If you want to reuse an initialised
injector, then you need guard it with an immutable injector as described in the
["Implementing Scoped Bindings" section](#implementing-scoped-bindings) (but in this case you can't override the bindings) or you can
simply create a new instance of injector as described in the example above.
{% include cend.html %}

Alternatively you can also use [conditions](#conditions) to define binding that are only active during the tests, but I would discourage
you from doing in most cases - it's always a good idea to keep your test code separated from the production code.

## Play Integration

To add a Scaldi support in the play application you need to include `scaldi-play` in the **build.sbt**:

{% highlight scala %}
libraryDependencies += "org.scaldi" %% "scaldi-play" % "{{site.version.scaldi-play}}"
{% endhighlight %}

After this you would be able to mix-in `ScaldiSupport` trait in the `Global` object:

{% highlight scala %}
object Global extends GlobalSettings with ScaldiSupport {
  def applicationModule = new WebModule :: new UserModule
}
{% endhighlight %}

As you can see, you also need to implement `applicationModule` method. By doing this you tell play which Injector should be used
to lookup the controller instances. This is also a good place to compose the main injector for your Play application.

Now you can bind controllers as any other class in the Module for example:

{% highlight scala %}
class Application(implicit inj: Injector) extends Controller with Injectable {
  val messageService = inject [MessageService]

  def index = Action {
    Ok(views.html.index(messageService.getGreetMessage("Test User")))
  }
}

class WebModule extends Module {
  binding to new Application

  bind [MessageService] to new OfficialMessageService
}
{% endhighlight %}

It's not much different from what haw you are using Scaldi outside of the play application. Nice thing about it
is that you no longer need to make `Controller` a global singleton `object`, but instead it can be a plain `class`.

One omportant thing that you now need to do is to prefix the controller class in the **conf/routes** file with `@`.
There is an example of how you can define a route for the `Application` controller:

{% highlight scala %}
GET  /                 @controllers.Application.index
{% endhighlight %}

By doing this, you are telling Play to use Scaldi to resolve the controller instance instead of trying to use it's own
internal mechanisms for it.

You can find a tutorial and an example play application in Scaldi Play Example ([GitHub]({{site.link.scaldi-play-example-github}}), [Blog]({{site.link.scaldi-play-example-blog}}), [Typesafe activator template]({{site.link.scaldi-play-example-template}})).

### Play-specific Bindings

Play support also makes following bindings automatically available for you to inject:

* `Application` - the Play `Application` in which injector lives
* `Mode` - the mode of the Play `Application`
* `Configuration` - the `Configuration` of the Play `Application`

### Play-specific Conditions

Following conditions are available for you to use in the binding definition:

* `inDevMode`
* `inTestMode`
* `inProdMode`

They all use Play `Application`s mode. Here is an example of how you can use them:

{% highlight scala %}
bind [Database] when inProdMode to new Riak
bind [Database] when (inDevMode or inTestMode) to new InMemoryDatabase
{% endhighlight %}

### Injecting Play Configuration

**scaldi-play** provides integration with Play configuration (`conf/application.conf`) out of the box.
So you can, for example, define `greeting.official` property there:

{% highlight scala %}
greeting.official = Welcome
{% endhighlight %}

and then just inject it anywhere in your application

{% highlight scala %}
val officialGreeting = inject [String] (identified by "greeting.official")
{% endhighlight %}

You can also inject other primitive types like `Int` or `Boolean` and not only `String` (similar to `PropertiesInjector`).
If you would like to use `configuration` instance directly, then you need inject it like this:

{% highlight scala %}
val config = inject [Configuration]
{% endhighlight %}

## Akka Integration

To add a Scaldi support in the akk application you need to include `scaldi-akka` in the **build.sbt**:

{% highlight scala %}
libraryDependencies += "org.scaldi" %% "scaldi-akka" % "{{site.version.scaldi-akka}}"
{% endhighlight %}

The only new thing that `scaldi-akka` adds is `AkkaInjectable`, which provides 2 additional inject methods:

* `injectActorRef` - creates a new actor with the help of `ActorRef` factory which should be implicitly available in the scope.
* `injectActorProps` - injects `Props` for the `Actor`, so that you can create new `Actor`s yourself with the help of the `ActorRef` factory.

where `ActorRef` can be one of two things:

* `ActorContext` - it always implicitly available within an `Actor` and can be used to create a new actors in the context of current actor
* `ActorSystem`

Here is a small example of how you can use `AkkaInjectable` to inject (which actually means create in case of actors) another actor:

{% highlight scala %}
class Receptionist (implicit inj: Injector) extends Actor with AkkaInjectable {
  val userService = inject [UserService]

  val orderProcessorProps = injectActorProps [OrderProcessor]
  val priceCalculator = injectActorRef [PriceCalculator]

  def receive = {
    case PlaceOrder(userName, itemId, netAmount) =>
        val processor = context.actorOf(orderProcessorProps)
        // ...
  }
}
{% endhighlight %}

Or alternatively, if you want to create an actor somewhere else (not inside an actor), you need to provide an implicit `ActorSystem` in the scope:

{% highlight scala %}
import scaldi.akka.AkkaInjectable._

implicit val appModule: Injector = // ...

implicit val system = inject [ActorSystem]

val receptionist = injectActorRef [Receptionist]
{% endhighlight %}

We have created some actors that are able to use `inject`. The only thing that remains now is to create a module that binds them together
with other dependencies and the `ActorSysyem` itself:

{% highlight scala %}
class OrderModule extends Module {
  bind [UserService] to new SimpleUserService

  bind [ActorSystem] to ActorSystem("ScaldiExample") destroyWith (_.shutdown())

  binding toProvider new Receptionist
  binding toProvider new OrderProcessor
  binding toProvider new PriceCalculator
}
{% endhighlight %}

I would like to point out how `Actor` are bound. It is important, that you bind then with `toProvider` function.
It will make sure, that Scaldi always creates new instances of the `Actor` classes when you injecting them
with `injectActorRef` or `injectActorProps`. These two methods actually use Akka mechanisms to configure an actor
instance under-the-hood, but the actor instance creation itself is always delegated to Scaldi.
During this process, Akka requires the delegate to always create new instances of an actor, so by binding `Actor`s
with `toProvider` you are fulfilling the protocol, that Akka implies.

You can find a tutorial and an example akka application in Scaldi Akka Example ([GitHub]({{site.link.scaldi-akka-example-github}}), [Blog]({{site.link.scaldi-akka-example-blog}}), [Typesafe activator template]({{site.link.scaldi-akka-example-template}})).