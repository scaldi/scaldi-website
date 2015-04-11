---
layout: normal-page
animateHeader: false
title: Scaldi Downloads
---

## Downloads

The latest version of the library is [{{site.version.scaldi}}]({{site.link.scaldi-releases}}).
You can view and download the sources directly from the [GitHub repo]({{site.link.scaldi-github}}).
If you want want to download jars, then please do so directly from the [maven central]({{site.link.scaldi-maven}}).
Scaldi is cross-compiled with Scala version **2.10** and **2.11**.
Starting from version **0.4** Scaldi only compiled with Scala version **2.11**. Below is a quick summary for every library.

### scaldi

<dl class="dl-horizontal">
  <dt>GitHub</dt><dd><a target="_blank" href="{{site.link.repo.scaldi}}">scaldi</a></dd>
  <dt>Latest version</dt><dd><a target="_blank" href="{{site.link.scaldi-releases}}">{{site.version.scaldi}}</a></dd>
  <dt>Maven central</dt><dd>
    for scala <a target="_blank" href="{{site.link.maven.scaldi}}2.10%7C{{site.version-210.scaldi}}%7Cjar">2.10</a> and
    <a target="_blank" href="{{site.link.maven.scaldi}}2.11%7C{{site.version.scaldi}}%7Cjar">2.11</a>
  </dd>
</dl>

You and use following dependency in your SBT build:

{% highlight scala %}
libraryDependencies += "org.scaldi" %% "scaldi" % "{{site.version.scaldi}}"
{% endhighlight %}

### scaldi-play

<dl class="dl-horizontal">
  <dt>GitHub</dt><dd><a target="_blank" href="{{site.link.repo.scaldi-play}}">scaldi-play</a></dd>
  <dt>Latest version</dt><dd><a target="_blank" href="{{site.link.scaldi-play-releases}}">{{site.version.scaldi-play}}</a></dd>
  <dt>Maven central</dt><dd>
    for scala <a target="_blank" href="{{site.link.maven.scaldi-play}}2.10%7C{{site.version-210.scaldi-play}}%7Cjar">2.10</a> and
    <a target="_blank" href="{{site.link.maven.scaldi-play}}2.11%7C{{site.version.scaldi-play}}%7Cjar">2.11</a>
  </dd>
</dl>

You and use following dependency in your SBT build:

{% highlight scala %}
libraryDependencies += "org.scaldi" %% "scaldi-play" % "{{site.version.scaldi-play}}"
{% endhighlight %}

scaldi-play has an [example project]({{site.link.scaldi-play-example-github}}) for you to play with.
It also an activator template which you can find [here]({{site.link.scaldi-play-example-template}}).

{% include ext.html type="info" title="Play 2.4.0" %}
There is an on-going effort to support new DI mechanism of Play 2.4.0. It is still **experimental**, but if you would like to try it out
in you own projects, then you can use **scaldi-play** version **{{site.version.scaldi-play-24}}** wich support play version **{{site.version.play-24}}**: `libraryDependencies += "org.scaldi" %% "scaldi-play" % "{{site.version.scaldi-play-24}}"`
{% include cend.html %}

### scaldi-akka

<dl class="dl-horizontal">
  <dt>GitHub</dt><dd><a target="_blank" href="{{site.link.repo.scaldi-akka}}">scaldi-akka</a></dd>
  <dt>Latest version</dt><dd><a target="_blank" href="{{site.link.scaldi-akka-releases}}">{{site.version.scaldi-akka}}</a></dd>
  <dt>Maven central</dt><dd>
    for scala <a target="_blank" href="{{site.link.maven.scaldi-akka}}2.10%7C{{site.version-210.scaldi-akka}}%7Cjar">2.10</a> and
    <a target="_blank" href="{{site.link.maven.scaldi-akka}}2.11%7C{{site.version.scaldi-akka}}%7Cjar">2.11</a>
  </dd>
</dl>

You and use following dependency in your SBT build:

{% highlight scala %}
libraryDependencies += "org.scaldi" %% "scaldi-akka" % "{{site.version.scaldi-akka}}"
{% endhighlight %}

scaldi-akka also has an [example project]({{site.link.scaldi-akka-example-github}}) with an [activator template]({{site.link.scaldi-akka-example-template}}).